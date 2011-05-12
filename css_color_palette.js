/*jslint strict:false, plusplus:false, regexp:false*/
/*global ko:false, document:false, window:false*/

(function (scimoz) {
	var showMessage, parse, filter, registerImages, generateCompletions, cleanup,
		showColorAutoComplete;

	// shows short messages via calltips
	showMessage = function (text) {
		scimoz.callTipShow(0, text);
		window.setTimeout(function () {
			scimoz.callTipCancel();
		}, 400 + text.length / 20 * 1000); // attention grabbing delay + 1s/20 chars
	};

	// parses the CSS file and returns the color/name pairs from the first comment
	parse = function (text) {
		var commentOne, lines, i, len, colorTable = [], line, pieces, ellipsis;

		// limits the label's text to 26 characters
		ellipsis = function (text) {
			if (text.length > 26) {
				text = text.substring(0, 25) + '\u2026';
			}
			return text;
		};

		commentOne = text.match(/\*([^*]|[\r\n]|(\*+([^*\/]|[\r\n])))*\*+/);
		if (commentOne && commentOne.length) {
			lines = commentOne[0].split('\n');
			for (i = 0, len = lines.length; i < len; i++) {
				line = lines[i];
				line = line.trim();
				if (line.charAt(0) === '#') {
					pieces = line.split(/\s+/);
					if (pieces.length >= 2) {
						colorTable.push([pieces[0], ellipsis(pieces[1])]);
					}
				}
			}
			if (!colorTable.length) {
				showMessage('No colors found in first comment. Use #rgb name or #rrggbb name.');
			}
		} else {
			showMessage('No comment found.');
		}
		return colorTable;
	};

	// removes malformed hex colors from an array (everything that isn't #rgb or #rrggbb)
	filter = function (colorTable) {
		var i, hexColor = /^#((\d|[a-fA-F]){3}|(\d|[a-fA-F]){6})$/;

		for (i = colorTable.length; i--;) {
			if (!hexColor.test(colorTable[i][0])) {
				colorTable.splice(i, 1);
			}
		}
		return colorTable;
	};

	// registers the required images with scimoz
	registerImages = function (colorTable, startId) {
		var i, len, maxWidth, expandColor, renderToCanvas, renderLabelToData,
			makeXpm, xpmGrayScalePalette;

		// calculates maximum width of the labels
		maxWidth = (function () {
			var max = 0, i, width, ctx;

			ctx = document
				.createElementNS('http://www.w3.org/1999/xhtml', 'html:canvas')
				.getContext('2d');

			ctx.font = '12px/16px monospace';

			for (i = colorTable.length; i--;) {
				width = ctx.measureText(colorTable[i][1]).width;
				if (width > max) {
					max = width;
				}
			}
			return max;
		}());

		// creates the 52 gray scale palette entries
		xpmGrayScalePalette = (function () {
			var chars, i, hex, pal = '';
			chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY_';
			for (i = 0; i < 52; i++) {
				hex = (i * 5).toString(16);
				if (hex.length < 2) {
					hex = '0' + hex;
				}
				pal += ',"' + chars[i] + ' c #' + hex + hex + hex + '"';
			}
			return pal;
		}());

		// expands #rgb to #rrggbb
		expandColor = function (color) {
			var c = color;
			if (c.length === 4) {
				c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
			}
			return c;
		};

		// renders to an off-screen Canvas (http://kaioa.com/node/103)
		renderToCanvas = function (width, height, renderFunction) {
			var buffer, ctx;
			buffer = document.createElementNS('http://www.w3.org/1999/xhtml', 'html:canvas');
			buffer.width = width;
			buffer.height = height;
			ctx = buffer.getContext('2d');
			renderFunction(ctx);
			return buffer;
		};

		// renders the label and returns its image data
		renderLabelToData = function (text, width, hpad) {
			var data;
			renderToCanvas(width, 16, function (ctx) {
				ctx.fillStyle = '#fff';
				ctx.fillRect(0, 0, width, 16);
				ctx.fillStyle = '#000';
				ctx.font = '12px/16px monospace';
				ctx.textBaseline = 'middle';
				ctx.fillText(text, 2, 9);
				data = ctx.getImageData(0, 0, width, 16).data;
			});
			return data;
		};

		// creates an XPM file
		makeXpm = function (color, text, width) {
			var i, s, labelData, x, hpad = 2,
				fullWidth = hpad + width + hpad,
				chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY_',
				offset, sum;

			labelData = renderLabelToData(text, fullWidth, hpad);

			// the XPM comment is critical, blows up otherwise
			s = '/* XPM */static char * x[] = {"' +
				(16 + fullWidth) + ' 16 53 1"' +
				',"* c ' + expandColor(color) + '"' +
				xpmGrayScalePalette;

			for (i = 0; i < 16; i++) {
				s += ',"****************';
				for (x = 0; x < fullWidth; x++) {
					offset = (i * fullWidth + x) * 4;
					sum = labelData[offset + 0] + labelData[offset + 1] + labelData[offset + 2];
					s += chars[Math.round((sum / 3) / 5)];
				}
				s += '"';
			}
			s += '};';

			return s;
		};

		for (i = 0, len = colorTable.length; i < len; i++) {
			scimoz.registerImage(startId + i, makeXpm(colorTable[i][0], colorTable[i][1], maxWidth));
		}
	};

	// generates the completions array
	generateCompletions = function (colorTable, startId) {
		var completions = [], i, len;

		for (i = 0, len = colorTable.length; i < len; i++) {
			completions.push(colorTable[i][0] + '?' + (startId + i));
		}

		return completions.join(
			String.fromCharCode(scimoz.autoCSeparator)
		);
	};

	// overwrites the color swatch + description images with a 1x1 pixel once the ac popup disappeared
	// this is necessary, because the image column doesn't shrink to fit (unlike the text column)
	cleanup = function (colorTable, startId) {
		var dumbPolling = window.setInterval(function () {
			var i, len,
				onePixel = '/* XPM */static char * x[] = {"1 1 1 1", "* c #000000", "*"};';
			if (!scimoz.autoCActive()) {
				for (i = 0, len = colorTable.length; i < len; i++) {
					scimoz.registerImage(startId + i, onePixel);
				}
				window.clearInterval(dumbPolling);
			}
		}, 10);
	};

	// shows the color auto complete popup
	showColorAutoComplete = function () {
		var colorTable, completions, startId = 9001;

		colorTable = parse(scimoz.text);
		colorTable = filter(colorTable);

		if (colorTable.length) {
			registerImages(colorTable, startId);
			completions = generateCompletions(colorTable, startId);

			scimoz.autoCShow(0, completions);

			cleanup(colorTable, startId);
		}
	};

	showColorAutoComplete();
}(ko.views.manager.currentView.scimoz));