function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('正規分布 物理シミュレーター')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
