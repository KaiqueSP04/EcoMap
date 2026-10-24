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

test('AI service sends only description and rejects invalid or inconsistent categories', async () => {
  const http = load('src/services/http.ts', {
    '@/config/api': config,
    'expo/fetch': { fetch: async (url, options) => {
      assert.equal(url, config.API_BASE_URL + '/occurrences/suggest-category');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { description: 'Galho quebrado na árvore' });
      return response({ category: 'Árvore', reason: 'suggested', message: 'Sugestão disponível.' });
    } },
  });
  const categories = load('src/services/categories.ts', {
    '@/services/http': http, '@/types/occurrence': load('src/types/occurrence.ts'),
  });
  assert.equal((await categories.suggestCategory('Galho quebrado na árvore')).category, 'Árvore');
  for (const invalid of [
    { category: 'Lixo', reason: 'suggested', message: 'bad' },
    { category: 'Árvore', reason: 'unavailable', message: 'bad' },
    { category: null, reason: 'suggested', message: 'bad' },
  ]) {
    const api = load('src/services/categories.ts', {
      '@/services/http': { requestJson: async () => invalid },
      '@/types/occurrence': load('src/types/occurrence.ts'),
    });
    await assert.rejects(api.suggestCategory('Descrição'), /sugestão inválida/);
  }
});

function emptyEvidence() {
  return { photo: null, coordinates: null, locating: false, selectingPhoto: false,
    removePhoto() {}, removeLocation() {}, locate() {}, selectPhoto() {} };
}

test('AI suggestion never changes category until explicitly accepted; ignore preserves manual choice', async () => {
  for (const accept of [true, false]) {
    let payload;
    const screen = screenHarness('src/app/register.tsx', {
      createOccurrence: async data => { payload = data; return { ...row, ...data }; },
    }, {
      evidence: emptyEvidence(),
      categories: { suggestCategory: async () => ({ category: 'Árvore', message: 'Sugestão disponível.' }) },
    });
    screen.render();
    await screen.press('Calçada');
    screen.nodes().find(node => node.type === 'TextInput').props.onChangeText('Galho quebrado');
    await screen.settle();
    await screen.press('Sugerir categoria com IA');
    await screen.settle();
    assert.match(screen.text(), /Sugestão: Árvore/);
    // The explicitly selected manual category remains unchanged before accept.
    const manual = screen.nodes().find(node => node.type === 'TouchableOpacity' && screen.text(node) === 'Calçada');
    assert.equal(manual.props.style.backgroundColor, '#172A4A');
    await screen.press(accept ? 'Usar sugestão' : 'Ignorar');
    await screen.settle();
    await screen.press('Registrar ocorrência');
    assert.equal(payload.category, accept ? 'Árvore' : 'Calçada');
  }
});

test('AI fallback and network failure leave manual registration available', async () => {
  for (const failure of ['network', 'unavailable', 'timeout', 'rate_limited', 'invalid_response', 'not_classified']) {
    let registered = false;
    const screen = screenHarness('src/app/register.tsx', {
      createOccurrence: async data => { registered = true; return { ...row, ...data }; },
    }, {
      evidence: emptyEvidence(),
      categories: { suggestCategory: async () => {
        if (failure === 'network') throw new Error('Falha na IA');
        return { category: null, message: 'Escolha manualmente: ' + failure };
      } },
    });
    screen.render();
    await screen.press('Calçada');
    screen.nodes().find(node => node.type === 'TextInput').props.onChangeText('Problema ambiental');
    await screen.settle();
    await screen.press('Sugerir categoria com IA');
    await screen.settle();
    assert.match(screen.text(), failure === 'network' ? /cadastro manual/ : /Escolha manualmente/);
    await screen.press('Registrar ocorrência');
    assert.equal(registered, true);
  }
});

test('editing description discards late AI results and duplicate requests are blocked', async () => {
  let finish, calls = 0;
  const screen = screenHarness('src/app/register.tsx', {}, {
    evidence: emptyEvidence(),
    categories: { suggestCategory: () => { calls++; return new Promise(resolve => { finish = resolve; }); } },
  });
  screen.render();
  screen.nodes().find(node => node.type === 'TextInput').props.onChangeText('Árvore quebrada');
  await screen.settle();
  const button = screen.nodes().find(node => node.type === 'TouchableOpacity' && screen.text(node).includes('Sugerir categoria com IA'));
  const pending = button.props.onPress();
  await button.props.onPress();
  await screen.settle();
  assert.match(screen.text(), /Consultando IA/);
  assert.equal(calls, 1);
  screen.nodes().find(node => node.type === 'TextInput').props.onChangeText('Calçada danificada');
  finish({ category: 'Árvore', message: 'old suggestion' });
  await pending;
  await screen.settle();
  assert.doesNotMatch(screen.text(), /Sugestão: Árvore/);
});

test('manual submission can finish while optional AI is pending and ignores its late answer', async () => {
  let finish, payload;
  const screen = screenHarness('src/app/register.tsx', {
    createOccurrence: async data => { payload = data; return { ...row, ...data }; },
  }, {
    evidence: emptyEvidence(),
    categories: { suggestCategory: () => new Promise(resolve => { finish = resolve; }) },
  });
  screen.render();
  await screen.press('Calçada');
  screen.nodes().find(node => node.type === 'TextInput').props.onChangeText('Praça abandonada');
  await screen.settle();
  const button = screen.nodes().find(node => node.type === 'TouchableOpacity' && screen.text(node).includes('Sugerir categoria com IA'));
  const pending = button.props.onPress();
  await screen.settle();
  await screen.press('Registrar ocorrência');
  assert.equal(payload.category, 'Calçada');
  finish({ category: 'Área verde', message: 'late' });
  await pending;
  await screen.settle();
  assert.doesNotMatch(screen.text(), /Sugestão: Área verde/);
});

test('status PATCH sends only status and validates the confirmed occurrence', async () => {
  const api = services(async (url, options) => {
    assert.equal(url, config.API_BASE_URL + '/occurrences/2/status');
    assert.equal(options.method, 'PATCH');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), { status: 'Em análise' });
    return response({ ...row, status: 'Em análise' });
  }).occurrences;
  assert.equal((await api.updateOccurrenceStatus(2, 'Em análise')).status, 'Em análise');
  for (const invalid of [{ ...row, id: 3, status: 'Resolvida' }, row]) {
    const invalidApi = services(async () => response(invalid)).occurrences;
    await assert.rejects(invalidApi.updateOccurrenceStatus(2, 'Resolvida'), /atualização de status inválida/);
  }
});

test('status PATCH propagates network, missing-ID and invalid-status failures', async () => {
  await assert.rejects(
    services(async () => { throw new TypeError('offline'); }).occurrences.updateOccurrenceStatus(2, 'Resolvida'),
    /conectar à API/
  );
  for (const code of [404, 422, 500]) {
    await assert.rejects(
      services(async () => response({}, code)).occurrences.updateOccurrenceStatus(2, 'Resolvida'),
      new RegExp('HTTP ' + code)
    );
  }
});

function textsEqualTo(screen, text) {
  return screen.nodes().filter(node => node.type === 'Text' && node.props.children === text).length;
}

test('details confirms status only after success and blocks duplicate saves synchronously', async () => {
  let finish, calls = 0;
  const screen = screenHarness('src/app/details.tsx', {
    getOccurrences: async () => [row],
    updateOccurrenceStatus: async (id, status) => {
      calls++;
      assert.equal(id, 2);
      assert.equal(status, 'Resolvida');
      return new Promise(resolve => { finish = resolve; });
    },
  }, {}, { id: '2' });
  await screen.settle();
  assert.equal(textsEqualTo(screen, 'Registrada'), 3);
  await screen.press('Resolvida');
  await screen.settle();
  assert.equal(textsEqualTo(screen, 'Registrada'), 3);
  const save = screen.nodes().find(node => node.type === 'TouchableOpacity' && screen.text(node).includes('Salvar status'));
  const pending = save.props.onPress();
  await save.props.onPress(); // Invoke the stale handler too, before React rerenders.
  await screen.settle();
  assert.equal(calls, 1);
  assert.match(screen.text(), /Salvando/);
  assert.equal(textsEqualTo(screen, 'Registrada'), 3);
  assert.ok(screen.nodes().filter(node => node.props.accessibilityRole === 'radio').every(node => node.props.disabled));
  finish({ ...row, status: 'Resolvida' });
  await pending;
  await screen.settle();
  assert.equal(textsEqualTo(screen, 'Resolvida'), 3);
  assert.match(screen.text(), /Status atualizado com sucesso/);
});

test('details preserves confirmed status after failed save and permits retry', async () => {
  let failed = true, calls = 0;
  const screen = screenHarness('src/app/details.tsx', {
    getOccurrences: async () => [row],
    updateOccurrenceStatus: async (_, status) => {
      calls++;
      if (failed) throw new Error('Connection failed');
      return { ...row, status };
    },
  }, {}, { id: '2' });
  await screen.settle();
  await screen.press('Em análise');
  await screen.settle();
  await screen.press('Salvar status');
  await screen.settle();
  assert.match(screen.text(), /Connection failed/);
  assert.equal(textsEqualTo(screen, 'Registrada'), 3);
  assert.equal(textsEqualTo(screen, 'Em análise'), 1); // Draft option, not confirmed badge/info.
  failed = false;
  await screen.press('Salvar status');
  await screen.settle();
  assert.equal(calls, 2);
  assert.equal(textsEqualTo(screen, 'Em análise'), 3);
  assert.match(screen.text(), /sucesso/);
});

test('saved status appears on details/list/home focus and preserves photo/GPS', async () => {
  let stored = { ...row, latitude: 0, longitude: -46, photo_path: photoPath };
  const api = services(async (url, options) => {
    if (options.method === 'PATCH') {
      assert.equal(url, config.API_BASE_URL + '/occurrences/2/status');
      stored = { ...stored, status: JSON.parse(options.body).status };
      return response(stored);
    }
    return response([stored]);
  }).occurrences;
  const home = screenHarness('src/app/index.tsx', api);
  const list = screenHarness('src/app/occurrences.tsx', api);
  await home.settle();
  await list.settle();
  assert.deepEqual(summaryValues(home), [1, 0, 0]);
  const details = screenHarness('src/app/details.tsx', api, {}, { id: '2' });
  await details.settle();
  await details.press('Em análise');
  await details.settle();
  await details.press('Salvar status');
  await details.settle();
  assert.equal(details.nodes().find(node => node.type === 'Image').props.source.uri, config.API_BASE_URL + photoPath);
  assert.match(details.text(), /0.000000, -46.000000/);
  await home.refocus();
  await list.refocus();
  assert.deepEqual(summaryValues(home), [1, 1, 0]);
  assert.match(list.text(), /Em análise/);
  const reopened = screenHarness('src/app/details.tsx', api, {}, { id: '2' });
  await reopened.settle();
  assert.equal(textsEqualTo(reopened, 'Em análise'), 3);
});

test('late save response cannot overwrite details loaded in a later focus', async () => {
  let finish;
  const screen = screenHarness('src/app/details.tsx', {
    getOccurrences: async () => [row],
    updateOccurrenceStatus: () => new Promise(resolve => { finish = resolve; }),
  }, {}, { id: '2' });
  await screen.settle();
  await screen.press('Resolvida');
  await screen.settle();
  const save = screen.nodes().find(node => node.type === 'TouchableOpacity' && screen.text(node).includes('Salvar status'));
  const pending = save.props.onPress();
  screen.blur();
  await screen.refocus();
  finish({ ...row, status: 'Resolvida' });
  await pending;
  await screen.settle();
  assert.equal(textsEqualTo(screen, 'Registrada'), 3);
  assert.doesNotMatch(screen.text(), /Status atualizado com sucesso/);
});
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

test('installed Expo SDK rejects the original unsupported URI descriptor', async () => {
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

function summaryValues(screen) {
  return screen.nodes()
    .filter(node => node.type === 'Text' && (
      typeof node.props.children === 'number'
      || node.props.children === '…' || node.props.children === '—'
    ))
    .map(node => node.props.children);
}

test('summary counts total registered and exact analysis/resolved statuses without mutating rows', () => {
  const { summarizeOccurrences } = services(() => assert.fail('Summary must not request data')).occurrences;
  const statuses = ['Registrada', 'Em análise', 'Em análise', 'Resolvida', 'Outro status'];
  const rows = Object.freeze(statuses.map((status, index) => Object.freeze({ ...row, id: index + 1, status })));
  const summary = summarizeOccurrences(rows);
  assert.equal(summary.registered, 5);
  assert.equal(summary.inAnalysis, 2);
  assert.equal(summary.resolved, 1);
  const empty = summarizeOccurrences([]);
  assert.equal(empty.registered, 0);
  assert.equal(empty.inAnalysis, 0);
  assert.equal(empty.resolved, 0);
});

test('home requests once per focus and updates all counters from the existing endpoint', async () => {
  let rows = [row, { ...row, id: 3, status: 'Resolvida' }, { ...row, id: 4, status: 'Em análise' }];
  let calls = 0;
  const api = services(async (url, options) => {
    calls++;
    assert.equal(url, config.API_BASE_URL + '/occurrences');
    assert.equal(options.method, undefined);
    return response(rows);
  }).occurrences;
  const screen = screenHarness('src/app/index.tsx', api);
  screen.render();
  assert.match(screen.text(), /Carregando resumo/);
  assert.deepEqual(summaryValues(screen), ['…', '…', '…']);
  await screen.settle();
  assert.deepEqual(summaryValues(screen), [3, 1, 1]);
  assert.equal(calls, 1);
  rows = [...rows, { ...row, id: 5 }];
  await screen.refocus();
  assert.deepEqual(summaryValues(screen), [4, 1, 1]);
  assert.equal(calls, 2);
});

test('home shows actual zeros only after successful empty response', async () => {
  const api = services(async () => response([])).occurrences;
  const screen = screenHarness('src/app/index.tsx', api);
  await screen.settle();
  assert.deepEqual(summaryValues(screen), [0, 0, 0]);
  assert.doesNotMatch(screen.text(), /Tentar novamente|Carregando resumo/);
});

test('home network failure hides numbers and retry restores counts; failed refresh hides stale values', async () => {
  let failed = true, calls = 0;
  const api = services(async () => {
    calls++;
    if (failed) throw new TypeError('Network request failed');
    return response([row, { ...row, id: 3 }]);
  }).occurrences;
  const screen = screenHarness('src/app/index.tsx', api);
  await screen.settle();
  assert.match(screen.text(), /conectar à API/);
  assert.deepEqual(summaryValues(screen), ['—', '—', '—']);
  failed = false;
  await screen.press('Tentar novamente');
  await screen.settle();
  assert.deepEqual(summaryValues(screen), [2, 0, 0]);
  assert.equal(calls, 2);
  failed = true;
  await screen.refocus();
  assert.deepEqual(summaryValues(screen), ['—', '—', '—']);
  assert.equal(calls, 3);
});

test('home rejects malformed lists and ignores an old response after losing focus', async () => {
  const malformedApi = services(async () => response({ detail: 'unexpected' })).occurrences;
  const malformed = screenHarness('src/app/index.tsx', malformedApi);
  await malformed.settle();
  assert.deepEqual(summaryValues(malformed), ['—', '—', '—']);
  assert.match(malformed.text(), /inválida/);

  let resolveOld, calls = 0;
  const api = services(() => {
    calls++;
    if (calls === 1) return new Promise(resolve => { resolveOld = resolve; });
    return Promise.resolve(response([row]));
  }).occurrences;
  const screen = screenHarness('src/app/index.tsx', api);
  screen.render();
  screen.blur();
  await screen.refocus();
  assert.deepEqual(summaryValues(screen), [1, 0, 0]);
  resolveOld(response([row, { ...row, id: 3 }]));
  await screen.settle();
  assert.deepEqual(summaryValues(screen), [1, 0, 0]);
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
  native.Alert = extras.alerts ?? { alert() {} };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useCallback(callback, dependencies) { callback.dependencies = dependencies; return callback; },
    useRef(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
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
    '@/services/categories': extras.categories ?? {},
    '@/services/descriptions': extras.descriptions ?? {},
    '@/types/occurrence': load('src/types/occurrence.ts'),
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
    await screen.press('Calçada');
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

test('description services use centralized API, real multipart and validate provider responses', async () => {
  const api = services(async (url, options) => {
    if (url.endsWith('/describe-image')) {
      assert.equal(url, config.API_BASE_URL + '/occurrences/describe-image');
      const encoded = await converter.convertFormDataAsync(options.body);
      assert.ok(encoded);
      assert.equal(options.body.get('file').size, 3);
    } else {
      assert.equal(url, config.API_BASE_URL + '/occurrences/improve-description');
      assert.deepEqual(JSON.parse(options.body), { description: 'Galho caido.' });
    }
    return response({ description: 'Galho caído.', reason: 'suggested', message: 'Revise.' });
  });
  const descriptions = load('src/services/descriptions.ts', {
    '@/services/http': api.http, '@/services/photos': api.photos,
  });
  assert.equal((await descriptions.describePhoto({ file: new Blob(['abc']), name: 'photo.jpg' })).description, 'Galho caído.');
  assert.equal((await descriptions.improveDescription('Galho caido.')).description, 'Galho caído.');
  for (const data of [{ description: 1 }, { description: 'x'.repeat(601), reason: 'suggested', message: 'x' },
    { description: null, reason: 'suggested', message: 'x' }, { description: 'x', reason: 'timeout', message: 'x' }]) {
    const invalid = load('src/services/descriptions.ts', {
      '@/services/http': { requestJson: async () => data }, '@/services/photos': {},
    });
    await assert.rejects(invalid.improveDescription('x'), /inválida/);
  }
});

test('text improvement preview requires acceptance and remains editable; ignoring preserves original', async () => {
  for (const accept of [false, true]) {
    const screen = screenHarness('src/app/register.tsx', {}, {
      evidence: emptyEvidence(), descriptions: {
        improveDescription: async () => ({ description: 'Galho caído.', message: 'Revise.' }),
      },
    });
    screen.render();
    const input = () => screen.nodes().find(node => node.type === 'TextInput');
    input().props.onChangeText('Galho caido');
    await screen.settle();
    await screen.press('Melhorar texto com IA');
    await screen.settle();
    assert.equal(input().props.value, 'Galho caido');
    assert.match(screen.text(), /Galho caído/);
    await screen.press(accept ? 'Usar descrição' : 'Ignorar descrição');
    await screen.settle();
    assert.equal(input().props.value, accept ? 'Galho caído.' : 'Galho caido');
    input().props.onChangeText('Texto revisado manualmente');
    await screen.settle();
    assert.equal(input().props.value, 'Texto revisado manualmente');
    assert.equal(input().props.editable, true);
  }
});

test('photo description sends nothing until explicit Google confirmation; cancel and stale consent do not send', async () => {
  const evidence = { ...emptyEvidence(), photo: { uri: 'file:///a.jpg', name: 'a.jpg' } };
  let buttons, calls = 0;
  const screen = screenHarness('src/app/register.tsx', {}, {
    evidence, alerts: { alert(title, message, actions) {
      assert.match(message, /Google/); assert.match(message, /conteúdo visível/); buttons = actions;
    } },
    descriptions: { describePhoto: async () => { calls++; return { description: 'Galho sobre o passeio.', message: 'Revise.' }; } },
  });
  await screen.settle();
  await screen.press('Gerar descrição com IA');
  assert.equal(calls, 0);
  assert.equal(buttons[0].text, 'Cancelar');
  await screen.press('Remover foto');
  buttons[1].onPress();
  await screen.settle();
  assert.equal(calls, 0);
  await screen.press('Gerar descrição com IA');
  buttons[1].onPress();
  await screen.settle();
  assert.equal(calls, 1);
  assert.equal(screen.nodes().find(node => node.type === 'TextInput').props.value, '');
  await screen.press('Usar descrição');
  await screen.settle();
  assert.equal(screen.nodes().find(node => node.type === 'TextInput').props.value, 'Galho sobre o passeio.');
});

test('editing text, replacing/removing photo and leaving screen discard late description suggestions', async () => {
  for (const action of ['edit', 'replace', 'remove', 'blur']) {
    let resolve, calls = 0;
    const evidence = { ...emptyEvidence(), photo: { uri: 'file:///a.jpg', name: 'a.jpg' },
      selectPhoto: async () => { evidence.photo = { uri: 'file:///b.jpg', name: 'b.jpg' }; },
      removePhoto: () => { evidence.photo = null; },
    };
    let confirm;
    const screen = screenHarness('src/app/register.tsx', {}, {
      evidence, alerts: { alert: (_, __, buttons) => { confirm = buttons[1].onPress; } },
      descriptions: { describePhoto: () => { calls++; return new Promise(done => { resolve = done; }); } },
    });
    await screen.settle();
    await screen.press('Gerar descrição com IA');
    confirm(); confirm();
    assert.equal(calls, 1);
    await screen.settle();
    if (action === 'edit') screen.nodes().find(node => node.type === 'TextInput').props.onChangeText('Manual');
    if (action === 'replace') await screen.press('Adicionar foto');
    if (action === 'remove') await screen.press('Remover foto');
    if (action === 'blur') screen.blur();
    resolve({ description: 'Sugestão antiga.', message: 'Revise.' });
    await screen.settle();
    assert.doesNotMatch(screen.text(), /Sugestão antiga/);
    assert.equal(screen.nodes().find(node => node.type === 'TextInput').props.value, action === 'edit' ? 'Manual' : '');
  }
});

test('failed or unavailable description assistance preserves manual submission; text edits invalidate in-flight improvements', async () => {
  for (const failure of [true, false]) {
    let payload;
    const screen = screenHarness('src/app/register.tsx', {
      createOccurrence: async value => { payload = value; return { ...row, ...value }; },
    }, {
      evidence: emptyEvidence(), descriptions: {
        improveDescription: async () => {
          if (failure) throw new Error('Falha de conexão');
          return { description: null, message: 'IA indisponível' };
        },
      },
    });
    screen.render();
    await screen.press('Calçada');
    screen.nodes().find(node => node.type === 'TextInput').props.onChangeText('Descrição manual');
    await screen.settle();
    await screen.press('Melhorar texto com IA');
    await screen.settle();
    assert.match(screen.text(), failure ? /Falha de conexão/ : /IA indisponível/);
    await screen.press('Registrar ocorrência');
    assert.equal(payload.description, 'Descrição manual');
  }
  let finish;
  const pending = screenHarness('src/app/register.tsx', {}, {
    evidence: emptyEvidence(), descriptions: { improveDescription: () => new Promise(done => { finish = done; }) },
  });
  pending.render();
  pending.nodes().find(node => node.type === 'TextInput').props.onChangeText('Texto inicial');
  await pending.settle();
  const request = pending.press('Melhorar texto com IA');
  pending.nodes().find(node => node.type === 'TextInput').props.onChangeText('Texto novo');
  finish({ description: 'Texto antigo melhorado', message: 'Revise.' });
  await request;
  await pending.settle();
  assert.doesNotMatch(pending.text(), /Texto antigo melhorado/);
});

test('photo network failures allow retry; completed previews are cleared on blur and never register automatically', async () => {
  let failed = true, consent, registrations = 0;
  const screen = screenHarness('src/app/register.tsx', {
    createOccurrence: async () => { registrations++; return row; },
  }, {
    evidence: { ...emptyEvidence(), photo: { uri: 'file:///a.jpg', name: 'a.jpg' } },
    alerts: { alert: (_, __, buttons) => { consent = buttons[1].onPress; } },
    descriptions: { describePhoto: async () => {
      if (failed) throw new Error('Falha ao enviar imagem');
      return { description: 'Galho sobre a calçada.', message: 'Revise.' };
    } },
  });
  await screen.settle();
  await screen.press('Gerar descrição com IA');
  consent();
  await screen.settle();
  assert.match(screen.text(), /Falha ao enviar imagem/);
  failed = false;
  await screen.press('Gerar descrição com IA');
  consent();
  await screen.settle();
  assert.match(screen.text(), /Galho sobre a calçada/);
  assert.equal(registrations, 0);
  screen.blur();
  await screen.refocus();
  assert.doesNotMatch(screen.text(), /Galho sobre a calçada/);
});
