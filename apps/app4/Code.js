function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('立体図形ビューア')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
