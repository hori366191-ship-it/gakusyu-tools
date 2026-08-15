/**
 * 公式ビューア GAS Web App バックエンド
 *
 * デプロイ手順:
 *   1. 下記 DRIVE_FOLDER_ID を、MDファイルを置いている Drive フォルダの ID に設定する
 *   2. GASエディタで「デプロイ」→「新しいデプロイ」→「種類: ウェブアプリ」を選択
 *   3. アクセスできるユーザーを「全員」などに設定してデプロイ
 *   4. 公開 URL はフロント側から自動取得されるため貼り付け不要
 *
 * 注意: コードを clasp push で更新した場合は、GASエディタのUIで
 *       デプロイを更新すること（clasp deploy だと匿名アクセスが無効化される）
 *
 * デプロイURL:
 *   https://script.google.com/macros/s/AKfycbzMNC1_ffakw1_1-zuYFNIhHj__NogqtjF--Yil-J4fRIW1i5BLYTF29dCNgkSCC2M2bg/exec
 *
 * API:
 *   GET ?action=getMdFilesList              -> フォルダ内の .md ファイル一覧 (JSON)
 *   GET ?action=getMdContent&id=<fileId>    -> 指定ファイルの内容 (JSON)
 *   GET ?action=getBundle[&refresh=1]       -> 一覧+全コンテンツのバンドル (JSON)
 *   上記以外のアクセス                         -> フロントエンド (Index.html) を配信
 *
 * 動作方式: バンドル方式
 *   ページロード時の1回の実行で一覧+全コンテンツを HTML に埋め込み、
 *   コンテンツの切り替えはブラウザ内で完結させる（閲覧ごとのGAS実行を排除）。
 *   トリガーは不要。
 */

// ▼▼▼▼▼【設定】MDファイル置き場の Drive フォルダ ID ▼▼▼▼▼
const DRIVE_FOLDER_ID = '1wrajAftZ5r5i0Yn5SNlhMq1fG-rDIVS3';
// ▲▲▲▲▲ 設定ここまで ▲▲▲▲▲

// ▼▼▼▼▼【設定】キャッシュ（応答速度の改善用） ▼▼▼▼▼
// ファイル一覧のキャッシュ時間(秒)。長いほど速いが、新しいファイルの反映が遅れる
const FILE_LIST_CACHE_TTL_SECONDS = 1800; // 30分
// コンテンツのキャッシュ時間(秒)。長いほど速いが、編集内容の反映が遅れる
const CONTENT_CACHE_TTL_SECONDS = 600; // 10分
// アクセス検証（フォルダ内・拡張子チェック）のキャッシュ時間(秒)
const VALIDATION_CACHE_TTL_SECONDS = 3600; // 1時間
// ▲▲▲▲▲ 設定ここまで ▲▲▲▲▲

/**
 * Webアプリへの GET リクエストを処理する
 * @param {GoogleAppsScript.Events.DoGet} e
 */
function doGet(e) {
  const params = e ? e.parameter : {};

  if (params.action === 'getMdFilesList') {
    return getMdFilesListResponse();
  }

  if (params.action === 'getMdContent' && params.id) {
    return getMdContentResponse(params.id);
  }

  if (params.action === 'getBundle') {
    return getBundleResponse(params.refresh === '1');
  }

  return serveHtml();
}

/**
 * フォルダ内の .md ファイル一覧を JSON で返す
 */
function getMdFilesListResponse() {
  try {
    const files = getMdFilesList();
    return jsonOutput_(files);
  } catch (error) {
    return jsonOutput_({ error: error.message });
  }
}

/**
 * 指定ファイルの内容を JSON で返す
 * @param {string} fileId - Google Drive のファイル ID
 */
function getMdContentResponse(fileId) {
  try {
    const content = getMdContent(fileId);
    return jsonOutput_(content);
  } catch (error) {
    return jsonOutput_({ error: error.message });
  }
}

/**
 * 一覧+全コンテンツのバンドルを JSON で返す
 * @param {boolean} refresh - true ならキャッシュを無視してDriveから再取得
 */
function getBundleResponse(refresh) {
  try {
    const bundle = getBundle(refresh);
    return jsonOutput_(bundle);
  } catch (error) {
    return jsonOutput_({ error: error.message });
  }
}

/**
 * 一覧+全コンテンツのバンドルを取得する（キャッシュ付き）
 *
 * フロントエンドはページロード時にこのデータを受け取り、
 * コンテンツの切り替えをブラウザ内で完結させる。
 * @param {boolean} forceRefresh - true ならキャッシュを無視してDriveから再取得
 * @returns {{files: {id: string, name: string, content: string}[], updatedAt: string}}
 */
function getBundle(forceRefresh = false) {
  const files = getMdFilesList(forceRefresh);
  const items = [];

  files.forEach(file => {
    try {
      const content = getMdContent(file.id, CONTENT_CACHE_TTL_SECONDS, forceRefresh);
      items.push({ id: content.id, name: content.name, content: content.content });
    } catch (error) {
      // 読み込めないファイルは除外して続行
      console.log('getBundle: ' + file.name + ' の読み込みに失敗: ' + error.message);
    }
  });

  return {
    files: items,
    updatedAt: new Date().toISOString()
  };
}

/**
 * 設定フォルダ内の .md ファイル一覧を取得する（キャッシュ付き）
 * @param {boolean} forceRefresh - true ならキャッシュを使わずDriveから再取得する
 * @returns {{id: string, name: string}[]}
 */
function getMdFilesList(forceRefresh = false) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'mdFilesList';

  if (!forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const iterator = folder.getFiles();
  const files = [];

  while (iterator.hasNext()) {
    const file = iterator.next();
    const name = file.getName();
    if (name.toLowerCase().endsWith('.md')) {
      files.push({ id: file.getId(), name: name });
    }
  }

  files.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  cache.put(cacheKey, JSON.stringify(files), FILE_LIST_CACHE_TTL_SECONDS);
  return files;
}

/**
 * 指定ファイルの Markdown 内容を取得する（キャッシュ付き）
 * @param {string} fileId - Google Drive のファイル ID
 * @param {number} ttl - キャッシュ時間(秒)。省略時は CONTENT_CACHE_TTL_SECONDS
 * @param {boolean} forceRefresh - true ならキャッシュを無視してDriveから再取得する
 * @returns {{id: string, name: string, content: string}}
 */
function getMdContent(fileId, ttl = CONTENT_CACHE_TTL_SECONDS, forceRefresh = false) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'mdContent_' + fileId;

  if (!forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  const file = DriveApp.getFileById(fileId);
  const name = file.getName();

  // セキュリティ検証: 設定フォルダ内の .md ファイルのみ読み取りを許可する（結果はキャッシュ）
  if (!isAllowedFile(file, name)) {
    throw new Error('アクセスが許可されていないファイルです。');
  }

  const content = file.getBlob().getDataAsString('UTF-8');
  const result = { id: file.getId(), name: name, content: content };
  cache.put(cacheKey, JSON.stringify(result), ttl);
  return result;
}

/**
 * 指定ファイルが「設定フォルダ内の .md ファイル」かどうかを検証する（結果キャッシュ付き）
 * @param {GoogleAppsScript.Drive.File} file - Driveのファイル
 * @param {string} name - ファイル名
 * @returns {boolean} 許可されたファイルなら true
 */
function isAllowedFile(file, name) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'mdValid_' + file.getId();

  const cached = cache.get(cacheKey);
  if (cached) {
    return cached === 'true';
  }

  let allowed = name.toLowerCase().endsWith('.md') &&
    file.getParents().hasNext() &&
    file.getParents().next().getId() === DRIVE_FOLDER_ID;

  cache.put(cacheKey, allowed ? 'true' : 'false', VALIDATION_CACHE_TTL_SECONDS);
  return allowed;
}

/**
 * JSON レスポンスを生成する
 * @param {*} obj
 */
function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * フロントエンド (Index.html) を配信する
 */
function serveHtml() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('公式ビューア')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
