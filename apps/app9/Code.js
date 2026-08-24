function doGet() {
  var html = HtmlService.createTemplateFromFile('index').evaluate();
  html.setTitle('原稿用紙作成');
  html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return html;
}
