figma.showUI(__html__, {
  width: 980,
  height: 760,
  themeColors: true
});

var GAP = 32;
var PADDING = 24;
var LABEL_HEIGHT = 24;

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  return null;
}

function pad2(value) {
  return String(value).length < 2 ? "0" + value : String(value);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  var mins = Math.floor(seconds / 60);
  var secs = Math.floor(seconds % 60);
  return pad2(mins) + ":" + pad2(secs);
}

function screenNumber(index) {
  return pad2(index + 1);
}

figma.ui.onmessage = async function (message) {
  if (message.type === "resize") {
    figma.ui.resize(message.width, message.height);
    return;
  }

  if (message.type === "notify") {
    figma.notify(message.message);
    return;
  }

  if (message.type !== "create-images") return;

  var images = Array.isArray(message.images) ? message.images : [];
  if (!images.length) {
    figma.notify("가져올 스크린샷을 선택해주세요.");
    return;
  }

  var canLabel = true;
  try {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  } catch (error) {
    canLabel = false;
  }

  var items = [];
  var maxWidth = 1;
  var totalImageHeight = 0;

  for (var imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
    var source = images[imageIndex];
    var sourceWidth = Math.max(1, Number(source.width) || 1);
    var sourceHeight = Math.max(1, Number(source.height) || 1);

    items.push({
      index: imageIndex,
      name: source.name,
      time: source.time,
      bytes: source.bytes,
      width: sourceWidth,
      height: sourceHeight
    });

    if (sourceWidth > maxWidth) maxWidth = sourceWidth;
    totalImageHeight += sourceHeight;
  }

  var boardWidth = PADDING * 2 + maxWidth;
  var boardHeight = PADDING * 2 + totalImageHeight + items.length * LABEL_HEIGHT + Math.max(0, items.length - 1) * GAP;

  var board = figma.createFrame();
  board.name = message.sourceName ? message.sourceName + " screenshots" : "App screenshots";
  board.resize(boardWidth, boardHeight);
  board.fills = [{ type: "SOLID", color: { r: 0.965, g: 0.98, b: 0.976 } }];
  board.clipsContent = false;
  board.x = figma.viewport.center.x - boardWidth / 2;
  board.y = figma.viewport.center.y - boardHeight / 2;

  var y = PADDING;
  var createdCount = 0;

  for (var itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    var item = items[itemIndex];
    var bytes = toBytes(item.bytes);
    if (!bytes) continue;

    var x = PADDING;
    var image = figma.createImage(bytes);

    if (canLabel) {
      var label = figma.createText();
      label.name = screenNumber(item.index) + " label";
      label.fontName = { family: "Inter", style: "Medium" };
      label.fontSize = 12;
      label.fills = [{ type: "SOLID", color: { r: 0.09, g: 0.125, b: 0.114 } }];
      label.characters = screenNumber(item.index) + "  " + formatTime(item.time) + "  " + Math.round(item.width) + "x" + Math.round(item.height);
      board.appendChild(label);
      label.x = x;
      label.y = y;
    }

    var rect = figma.createRectangle();
    rect.name = item.name || "screen-" + screenNumber(item.index);
    rect.resize(item.width, item.height);
    board.appendChild(rect);
    rect.x = x;
    rect.y = y + LABEL_HEIGHT;
    rect.cornerRadius = 10;
    rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FIT" }];
    rect.strokes = [{ type: "SOLID", color: { r: 0.86, g: 0.91, b: 0.895 } }];
    rect.strokeWeight = 1;
    createdCount += 1;
    y += LABEL_HEIGHT + item.height + GAP;
  }

  figma.currentPage.selection = [board];
  figma.viewport.scrollAndZoomIntoView([board]);
  figma.notify(createdCount + "개의 스크린샷을 Figma 캔버스에 배치했습니다.");
  figma.ui.postMessage({ type: "import-complete", count: createdCount });
};
