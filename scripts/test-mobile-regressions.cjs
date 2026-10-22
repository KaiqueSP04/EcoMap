/* No extra test libraries. Native File I/O and navigation are simulated;
 * multipart encoding uses the actual installed Expo SDK implementation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function load(relativePath, imports = {}, globals = {}) {
  const sandbox = {
    exports: {}, Error, TypeError, Blob, Uint8Array, TextEncoder, TextDecoder,
    AbortController, setTimeout, clearTimeout, console,
    require(name) {
      if (!(name in imports)) throw new Error('Unexpected import: ' + name);
      return imports[name];
    },
    ...globals,
  };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relativePath), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, sandbox, { filename: relativePath });
  return sandbox.exports;
}
const config = load('src/config/api.ts');
const blobUtils = load('node_modules/expo/src/utils/blobUtils.ts');
const converter = load('node_modules/expo/src/winter/fetch/convertFormData.ts', {
  '../../utils/blobUtils': blobUtils,
});
const formPatch = load('node_modules/expo/src/winter/FormData.ts');
class NativeFormData { constructor() { this._parts = []; } }
const ExpoFormData = formPatch.installFormDataPatch(NativeFormData);
const photoPath = '/uploads/' + 'a'.repeat(32) + '.jpg';
const row = { id: 2, category: 'Tree', description: 'Second record', status: 'Registrada', photo_path: null, latitude: null, longitude: null };
function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) };
}
function services(fetchImpl, FileImpl = class {}) {
  const http = load('src/services/http.ts', { 'expo/fetch': { fetch: fetchImpl }, '@/config/api': config });
  return {
    http,
    photos: load('src/services/photos.ts', {
      '@/config/api': config, 'expo-file-system': { File: FileImpl }, '@/services/http': http,
    }, { FormData: ExpoFormData }),
    occurrences: load('src/services/occurrences.ts', { '@/services/http': http }),
  };
}

test('SDK 57 reproduces the original URI descriptor error', async () => {
  const form = new ExpoFormData();
  form.append('file', { uri: 'file:///photo.png', name: 'photo.png', type: 'image/png' });
  await assert.rejects(converter.convertFormDataAsync(form), /Unsupported FormDataPart implementation/);
});

test('native File is serialized by the real Expo encoder as multipart file bytes', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  class LocalFile {
    constructor(uri) { this.uri = uri; this.name = 'photo.png'; this.type = 'image/png'; this.exists = true; this.size = bytes.length; }
    async bytes() { return bytes; }
  }
  const { photos } = services(async (url, options) => {
    assert.equal(url, config.API_BASE_URL + '/uploads');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers, undefined); // Expo must set the multipart boundary.
    const encoded = await converter.convertFormDataAsync(options.body, 'test-boundary');
    const body = Buffer.from(encoded.body);
    assert.ok(body.includes(Buffer.from('name="file"; filename="photo.png"')));
    assert.ok(body.includes(Buffer.from('content-type: image/png')));
    assert.ok(body.includes(Buffer.from(bytes)));
    return response({ photo_path: photoPath }, 201);
  }, LocalFile);
  assert.equal(await photos.uploadPhoto({ uri: 'file:///photo.png', name: 'photo.png', mimeType: 'image/png' }), photoPath);
  assert.equal(photos.getPhotoUrl(photoPath), config.API_BASE_URL + photoPath);
});

test('web Blob upload and 8 MiB limit remain supported', async () => {
  const { photos } = services(async (_, options) => {
    const encoded = await converter.convertFormDataAsync(options.body);
    assert.match(new TextDecoder().decode(encoded.body), /name="file"/);
    return response({ photo_path: photoPath }, 201);
  });
  const photo = { uri: 'blob:photo', name: 'web.png', mimeType: 'image/png', file: new Blob(['image'], { type: 'image/png' }) };
  assert.equal(await photos.uploadPhoto(photo), photoPath);
  const oversized = new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: 'image/png' });
  await assert.rejects(photos.uploadPhoto({ ...photo, file: oversized }), /8 MB/);
});

test('missing native file is rejected before sending a request', async () => {
  const { photos } = services(() => assert.fail('No network expected'), class { exists = false; });
  await assert.rejects(photos.uploadPhoto({ uri: 'file:///missing', name: 'photo.jpg' }), /Selecione/);
});

test('list parses two rows; successful [] is the only empty-list response', async () => {
  let data = [row, { ...row, id: 3 }];
  const { occurrences } = services(async url => {
    assert.equal(url, config.API_BASE_URL + '/occurrences');
    return response(data);
  });
  assert.equal((await occurrences.getOccurrences()).length, 2);
  data = [];
  assert.equal((await occurrences.getOccurrences()).length, 0);
  for (const invalid of [{ detail: 'error' }, [{}], [{ ...row, id: '2' }]]) {
    data = invalid;
    await assert.rejects(occurrences.getOccurrences(), /lista.*inválida/);
  }
});

test('network, HTTP, JSON and timeout failures reject instead of returning []', async () => {
  await assert.rejects(services(async () => { throw new TypeError('network'); }).occurrences.getOccurrences(), /conectar à API/);
  await assert.rejects(services(async () => response({}, 500)).occurrences.getOccurrences(), /HTTP 500/);
  await assert.rejects(services(async () => ({ ok: true, text: async () => '<html>' })).occurrences.getOccurrences(), /resposta inválida/);
  const stalled = services((_, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('abort')));
  }));
  await assert.rejects(stalled.http.requestJson('/occurrences', {}, 5), /demorou/);
});

test('POST JSON preserves category/description and optional photo/GPS, including zero', async () => {
  let expected;
  const { occurrences } = services(async (_, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), expected);
    return response({ ...row, ...expected });
  });
  expected = { category: 'Tree', description: 'Without photo' };
  await occurrences.createOccurrence(expected);
  expected = { category: 'Tree', description: 'With evidence', latitude: 0, longitude: -46, photo_path: photoPath };
  await occurrences.createOccurrence(expected);
});

/* A small hook/navigation harness tests screen branches and event handlers.
 * It does not claim to emulate native rendering or camera/GPS hardware. */
function screenHarness(file, source, extras = {}, params = {}) {
  const state = [];
  let cursor = 0, effect, cleanup, lastDependencies, tree;
  const jsx = (type, props) => ({ type, props });
  const native = Object.fromEntries(['View', 'Text', 'TouchableOpacity', 'ScrollView', 'Image', 'TextInput', 'ActivityIndicator'].map(name => [name, name]));
  native.StyleSheet = { create: value => value };
  native.Alert = { alert() {} };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useCallback(callback, dependencies) { callback.dependencies = dependencies; return callback; },
  };
  const router = {
    router: { back() {}, push() {} },
    useLocalSearchParams: () => params,
    useFocusEffect(callback) {
      if (!lastDependencies || callback.dependencies.some((value, index) => value !== lastDependencies[index])) {
        lastDependencies = callback.dependencies;
        effect = callback;
      }
    },
  };
  const Screen = load(file, {
    react, 'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'expo-router': router, '@/services/occurrences': source,
    '@/services/photos': { getPhotoUrl: p => config.API_BASE_URL + p, ...extras.photos },
    '@/hooks/use-occurrence-evidence': { useOccurrenceEvidence: () => extras.evidence },
  }).default;
  function render() {
    cursor = 0;
    tree = Screen();
    if (effect) { const run = effect; effect = undefined; cleanup?.(); cleanup = run(); }
    return tree;
  }
  function nodes(node = tree) {
    if (Array.isArray(node)) return node.flatMap(child => nodes(child));
    if (!node || typeof node !== 'object') return [];
    return [node, ...nodes(node.props?.children ?? null)];
  }
  function text(node = tree) {
    if (Array.isArray(node)) return node.map(child => text(child)).join(' ');
    if (node && typeof node === 'object') return text(node.props?.children ?? null);
    return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
  }
  return {
    render, text, nodes,
    async settle() { render(); await new Promise(setImmediate); render(); return text(); },
    async press(label) {
      const button = nodes().find(node => node.type === 'TouchableOpacity' && text(node).includes(label));
      assert.ok(button, 'Missing button: ' + label);
      await button.props.onPress();
    },
    blur() { cleanup?.(); },
    async refocus() { lastDependencies = undefined; return this.settle(); },
  };
}

test('list shows loading, error with retry, success and refresh on focus', async () => {
  let failed = true, calls = 0;
  const screen = screenHarness('src/app/occurrences.tsx', {
    getOccurrences: async () => { calls++; if (failed) throw new Error('Wi-Fi unavailable'); return [row]; },
  });
  screen.render();
  assert.match(screen.text(), /Carregando/);
  let text = await screen.settle();
  assert.match(text, /Wi-Fi unavailable/);
  assert.doesNotMatch(text, /Nenhuma ocorrência registrada/);
  failed = false;
  await screen.press('Tentar novamente');
  text = await screen.settle();
  assert.match(text, /Second record/);
  assert.doesNotMatch(text, /Nenhuma ocorrência registrada/);
  await screen.refocus();
  assert.equal(calls, 3);
});

test('empty list is shown only after a successful empty response; blur ignores stale response', async () => {
  const empty = screenHarness('src/app/occurrences.tsx', { getOccurrences: async () => [] });
  assert.match(await empty.settle(), /Nenhuma ocorrência registrada/);
  let resolve;
  const delayed = screenHarness('src/app/occurrences.tsx', { getOccurrences: () => new Promise(done => { resolve = done; }) });
  delayed.render();
  delayed.blur();
  resolve([row]);
  const text = await delayed.settle();
  assert.doesNotMatch(text, /Second record/);
});

test('details selects the requested ID, uses LAN image URL and distinguishes communication failure', async () => {
  const detail = { ...row, photo_path: photoPath, latitude: 0, longitude: -46 };
  const screen = screenHarness('src/app/details.tsx', { getOccurrences: async () => [{ ...row, id: 1, description: 'Other record' }, detail] }, {}, { id: '2' });
  const text = await screen.settle();
  assert.match(text, /Second record/);
  assert.doesNotMatch(text, /Other record/);
  assert.match(text, /0.000000/);
  assert.equal(screen.nodes().find(node => node.type === 'Image').props.source.uri, config.API_BASE_URL + photoPath);
  const failed = screenHarness('src/app/details.tsx', { getOccurrences: async () => { throw new Error('Connection failed'); } }, {}, { id: '2' });
  const errorText = await failed.settle();
  assert.match(errorText, /Connection failed/);
  assert.doesNotMatch(errorText, /Ocorrência não encontrada/);
});

test('registration without photo skips upload; with photo/GPS uses persistent upload reference', async () => {
  for (const withEvidence of [false, true]) {
    let payload, uploads = 0;
    const evidence = {
      photo: withEvidence ? { uri: 'file:///photo.jpg', name: 'photo.jpg' } : null,
      coordinates: withEvidence ? { latitude: 0, longitude: -46 } : null,
      locating: false, selectingPhoto: false,
      removePhoto() {}, removeLocation() {}, locate() {}, selectPhoto() {},
    };
    const screen = screenHarness('src/app/register.tsx', {
      createOccurrence: async data => { payload = data; return { ...row, ...data }; },
    }, { evidence, photos: { uploadPhoto: async () => { uploads++; return photoPath; } } });
    screen.render();
    screen.nodes().find(node => node.type === 'TextInput').props.onChangeText('New test');
    await screen.settle();
    await screen.press('Registrar ocorrência');
    assert.equal(payload.description, 'New test');
    assert.equal(uploads, withEvidence ? 1 : 0);
    if (withEvidence) {
      assert.equal(payload.photo_path, photoPath);
      assert.equal(payload.latitude, 0);
      assert.equal(payload.longitude, -46);
    } else {
      assert.equal(payload.photo_path, undefined);
      assert.equal(payload.latitude, undefined);
    }
  }
});
