function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('微分積分ビジュアライザー')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
