function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('原子・周期表ツール')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
