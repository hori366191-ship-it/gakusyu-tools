function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('月の満ち欠けシミュレーター')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
