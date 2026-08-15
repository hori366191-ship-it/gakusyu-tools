/**
 * 学習ツール ポータル
 * Webアプリのフロントページ (index.html) を配信する
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('学習ツール')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
