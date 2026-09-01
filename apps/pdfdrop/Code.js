function doGet(e){
  return ContentService.createTextOutput(JSON.stringify({migrated:true,newUrl:"https://hori366191-ship-it.github.io/gakusyu-tools/"}))
    .setMimeType(ContentService.MimeType.JSON);
}
function doPost(e){
  return ContentService.createTextOutput(JSON.stringify({migrated:true,newUrl:"https://hori366191-ship-it.github.io/gakusyu-tools/"}))
    .setMimeType(ContentService.MimeType.JSON);
}
