/** Browser-only, cross-platform output filename rules. */
const utf8 = new TextEncoder();
export const DEFAULT_SUFFIX = 'organized';
const WINDOWS_FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f\u007f]/;
const WINDOWS_DEVICE = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;

export function normalizeOutputSuffix(value = '') {
  if (typeof value !== 'string') throw new Error('追加文字は文字列で指定してください。');
  const suffix = value.trim().normalize('NFC') || DEFAULT_SUFFIX;
  if (suffix === '.' || suffix === '..' || WINDOWS_FORBIDDEN.test(suffix) || /[. ]$/.test(suffix) ||
      WINDOWS_DEVICE.test(suffix) || utf8.encode(suffix).length > 80) {
    throw new Error('追加文字に使用できない文字・長さがあります。\\ / : * ? " < > |、制御文字、末尾の点・空白などは使用できません（80バイト以内）。');
  }
  return suffix;
}

export function safeZipEntryPath(value) {
  if (typeof value !== 'string' || !value) throw new Error('ファイル名がありません。');
  const parts = value.replace(/\\/g, '/').split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error('出力先に不正なパスが含まれています：' + value);
  }
  const normalized = parts.map(part => {
    const p = part.normalize('NFC');
    if (WINDOWS_FORBIDDEN.test(p) || /[. ]$/.test(p) || WINDOWS_DEVICE.test(p) ||
        utf8.encode(p).length > 255) {
      throw new Error('OS間で扱えないファイル名・フォルダ名があります：' + part + '（長さはUTF-8で255バイト以内）');
    }
    return p;
  }).join('/');
  if (utf8.encode(normalized).length > 1024) throw new Error('出力ファイルのパスが長すぎます。');
  return normalized;
}

export function organizedNotebookPath(sourcePath, extraSuffix = '') {
  const safeInput = safeZipEntryPath(sourcePath);
  const pos = safeInput.lastIndexOf('/');
  const name = safeInput.slice(pos + 1);
  const extension = name.match(/\.ipynb$/i)?.[0];
  if (!extension) throw new Error('Notebook（.ipynb）以外は出力できません：' + name);
  const stem = name.slice(0, -extension.length);
  if (!stem) throw new Error('Notebookのファイル名が空です。');
  const renamed = stem + '_' + normalizeOutputSuffix(extraSuffix) + extension;
  return safeZipEntryPath((pos >= 0 ? safeInput.slice(0, pos + 1) : '') + renamed);
}

export function pathCollisionKey(name) {
  return safeZipEntryPath(name).toLocaleLowerCase('en-US');
}
