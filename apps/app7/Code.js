function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('月と星座シミュレーター')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
