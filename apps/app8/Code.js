function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('英文法ビジュアライザー')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
