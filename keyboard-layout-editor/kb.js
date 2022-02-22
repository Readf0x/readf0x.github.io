/*jslint bitwise:true, white:true, plusplus:true, vars:true, browser:true, devel:true, regexp:true */
/*global angular:true, rison:true, $:true */
(function () {
	"use strict";

	function toJsonPretty(obj) {
		var res = [];
		obj.forEach(function(elem,ndx) {
			// We don't want CSS & notes in the Raw Data editor; they have their
			// own editors, and inclusion in the raw data tab just clutters it up.
			// Other metadata isn't too bad, but doesn't really offer any benefit.
			if(ndx > 0 || (elem instanceof Array)) {
				res.push($serial.toJsonL(elem));
			}
		});
		return res.join(",\n")+"\n";
	}
	function fromJsonPretty(json) { return $serial.fromJsonL('['+json+']'); }

	// The angular module for our application
	var kbApp = angular.module('kbApp', ["ngSanitize", "ngCookies", "ui.utils", "ui.bootstrap", "ui.bootstrap.tooltip", "ui.ace", "ngFileUpload", "ang-drag-drop", "colorpicker.module"], function($tooltipProvider) {
		// Default tooltip behaviour
		$tooltipProvider.options({animation: false, appendToBody: true});
	});

	// The main application controller
	kbApp.controller('kbCtrl', ['$scope','$http','$location','$timeout', '$sce', '$sanitize', '$modal', '$cookies', '$confirm', '$q', function($scope, $http, $location, $timeout, $sce, $sanitize, $modal, $cookies, $confirm, $q) {
		var serializedTimer = false;
		var customStylesTimer = false;

		// The application version
		$scope.version = "0.15";

		// Github data
		$scope.githubClientId = $location.host() === "localhost" ? "8b7b224a9e212c5c17e2" : "631d93caeaa61c9057ab";
		function github(path, method, data) {
			method = method || "GET";
			var headers = {};
			headers["Accept"] = "application/vnd.github.v3+json";
			if($cookies.oauthToken) {
				headers["Authorization"] = "token " + $cookies.oauthToken;
			}
			return $http({method:method, url:"https://api.github.com"+path, headers:headers, data:data, cache:false});
		}
		$scope.currentGist = null;
		$scope.isStarred = false;
		function setGist(gist) {
			$scope.currentGist = gist;
			$scope.isStarred = false;
			if(gist) {
				github("/gists/"+gist.id+"/star").success(function() { $scope.isStarred = true; });
			}
		}
		$scope.setGistStar = function(gist, star) {
			if($scope.user && $scope.user.id && gist && (gist != $scope.currentGist || $scope.isStarred != star)) {
				github("/gists/"+gist.id+"/star", star ? "PUT" : "DELETE").success(function() {
					if(gist === $scope.currentGist) {
						$scope.isStarred = star;
					}
				});
			}
		}

		// The selected tab; 0 == Properties, 1 == Kbd Properties, 3 == Custom Styles, 2 == Raw Data
		$scope.selTab = 0;

		// An array used to keep track of the selected keys
		$scope.selectedKeys = [];

		// A single key selection; if multiple keys are selected, this is the
		// most-recently selected one.
		$scope.multi = {};
		$scope.meta = {};

		// Options
		$scope.sizeStep = 0.25;
		$scope.moveStep = 0.25;
		$scope.rotateStep = 15;

		// The keyboard data
		$scope.keyboard = { keys: [], meta: {} };
		$scope.keys = function(newKeys) { if(newKeys) { $scope.keyboard.keys = newKeys; } return $scope.keyboard.keys; };

		// Custom Styles data
		$scope.customStylesException = "";
		$scope.customStyles = "";
		$scope.customGlyphs = [];

		// Helper function to select/deselect all keys
		$scope.unselectAll = function() {
			$scope.selectedKeys = [];
			$scope.multi = {};
		};
		$scope.selectAll = function(event) {
			if(event) { event.preventDefault(); event.stopPropagation(); }
			$serial.sortKeys($scope.keys());
			$scope.unselectAll();
			$scope.keys().forEach(function(key) {
				$scope.selectedKeys.push(key);
			});
			if($scope.keys().length>0) {
				$scope.multi = angular.copy($scope.keys().last());
			}
		};

		$scope.save = function(event) {
			if(!$scope.user || !$scope.user.id) {
				return;
			}
			if(event) {
				event.preventDefault();
				event.stopPropagation();
			}
			if($scope.dirty) {
				// Make a copy of the keyboard, and extract the CSS & notes
				var layout = angular.copy($scope.keyboard);
				var css = layout.meta.css; delete layout.meta.css;
				var notes = layout.meta.notes; delete layout.meta.notes;
				var description = layout.meta.name || "Untitled Keyboard Layout";

				// Compute a reasonable filename base from the layout's name
				var fn_base = (layout.meta.name || "layout").trim().replace(/[\"\']/g,'').replace(/\s/g,'-').replace(/[^-A-Za-z0-9_,;]/g,'_');
				var fn_base_old = fn_base;

				var url = "/gists";
				var method = "POST";
				if($scope.currentGist) {
					// Saving over existing Gist
					if(!$scope.currentGist.owner || ($scope.currentGist.owner.login !== $scope.user.id)) {
						// Different owner
						if(window.confirm("This layout is owned by a different user.\n\nDid you want create your own fork of this layout?")) {
							github("/gists/" + $scope.currentGist.id + "/forks", "POST").success(function(response) {
								// success
								$location.path("/gists/"+response.id).hash("").replace();
								setGist(response);
								$scope.save(); // recurse to do the actual saving
							}).error(function(data, status) {
								// error
								$scope.saved = false;
								$scope.saveError = status.toString() + " - " + data.toString();
							});
						}
						return;
					}

					// Updating our own Gist
					url = "/gists/" + $scope.currentGist.id;
					method = "PATCH";

					// Determine existing filename base
					for(var fn in $scope.currentGist.files) {
						var ndx = fn.indexOf(".kbd.json");
						if(ndx >= 0) {
							fn_base_old = fn.substring(0,ndx);
							break;
						}
					}
				}

				// Build the data structure
				var data = { description: description, files: {} };
				var doFile = function(suffix, fileData) {
					if(fileData) {
						data.files[fn_base_old+suffix] = {filename: fn_base+suffix, content: fileData};
					} else if($scope.currentGist && $scope.currentGist.files[fn_base_old+suffix]) {
						data.files[fn_base_old+suffix] = null; // Remove existing file
					}
				}
				doFile(".kbd.json", angular.toJson($serial.serialize(layout), true /*pretty*/));
				doFile(".style.css", css);
				doFile(".notes.md", notes);

				// Post data to GitHub
				github(url, method, data).success(function(response) {
					//success
					$scope.dirty = false;
					$scope.saved = response.id;
					$location.path("/gists/"+response.id).hash("").replace();
					$scope.saveError = "";
					setGist(response);
				}).error(function(data,status) {
					// error
					$scope.saved = false;
					$scope.saveError = status.toString() + " - " + data.toString();
				});
			}
		};
		$scope.canSave = function() {
			return $scope.dirty && $scope.user && $scope.user.id;
    };
    $scope.getFilename = function() {
      var name = $scope.keyboard.meta.name.toLowerCase();
      name = name.replace(/[\/\?<>\\:\*\|": \t\x00-\x1f\x80-\x9f\.]+/g,'-'); // control codes, whitespace & invalid filename characters
      name = name.replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/,''); // reserved windows filenames
      console.log(name);
      return name || "keyboard-layout";
    }
		$scope.downloadSvg = function() {
			var data = $renderKey.fullSVG($scope.keys(), $scope.keyboard.meta);
			var blob = new Blob([data], {type:"image/svg+xml"});
			saveAs(blob, $scope.getFilename()+".svg");
		};
		$scope.downloadPng = function() {
			html2canvas($("#keyboard-bg"), {
				useCORS: true,
				onrendered: function(canvas) {
					canvas.toBlob(function(blob) {
						saveAs(blob, $scope.getFilename()+".png");
					});
				}
			});
		};
		function getResizedCanvas(canvas,newWidth,newHeight,bgcolor) {
			var tmpCanvas = document.createElement('canvas');
			tmpCanvas.width = newWidth;
			tmpCanvas.height = newHeight;

			var ctx = tmpCanvas.getContext('2d');
			if (bgcolor != '') {
				ctx.rect(0,0,newWidth,newHeight);
				ctx.fillStyle=bgcolor;
				ctx.fill();
			};
			ctx.drawImage(canvas,0,0,canvas.width,canvas.height,0,0,newWidth,newHeight);
			return tmpCanvas;
		}

		$scope.downloadJpg = function() {
			html2canvas($("#keyboard-bg"), {
				useCORS: true,
				onrendered: function(canvas) {
					var thm = getResizedCanvas(canvas,canvas.width,canvas.height,'white'); // not actually resize, just get white background
					thm.toBlob(function(blob) {
						saveAs(blob, $scope.getFilename()+".jpg");
					},"image/jpeg");
				}
			});
		};

		$scope.downloadThumb = function() {
			html2canvas($("#keyboard-bg"), {
				useCORS: true,
				onrendered: function(canvas) {
					var p = 110 / canvas.width;
					var thmwidth = canvas.width * p;
					var thmheight = canvas.height * p;
					var thm = getResizedCanvas(canvas,thmwidth,thmheight,'');
					thm.toBlob(function(blob) {
						saveAs(blob, $scope.getFilename()+"-thumb.png");
					});
				}
			})
		};

		$scope.downloadJson = function() {
			var data = angular.toJson($serial.serialize($scope.keyboard), true /*pretty*/);
			var blob = new Blob([data], {type:"application/json"});
			saveAs(blob, $scope.getFilename()+".json");
		};
		$scope.uploadJson = function(file, event) {
			if(file && file[0]) {
				var reader = new FileReader();
				reader.onload = function(event) {
					transaction("upload", function() {
						$scope.$apply(function() {
							$scope.deserializeAndRender($serial.fromJsonL(event.target.result));
						});
					});
				};
				reader.readAsText(file[0]);
			}
		};

		// count the keys
		// use ~Total instead of Total to force it to bottom when displeyed
		$scope.keyCount = function() {
			var kcounts = new Object();
			kcounts["~Total"] = 0;
			kcounts["Decals"] = 0;
			angular.forEach($scope.keys(), function(key) {
				kcounts["~Total"]++;
				var thisk = "";
				if(key.decal) {
					kcounts["Decals"]++;
					thisk = "Decal ";
				}
				thisk += key.width + " x " + key.height;
				if(!key.decal) {
						var foo = key.color; // next line refused to work with key.color.
						var colourname = reverseColors[foo];
						if(!colourname) { // not a defined name
							colourname = "";
						}
					thisk += " " + colourname + " (" + key.color + ")";
				}
				if(kcounts[thisk]) {
					kcounts[thisk]++;
				} else {
					kcounts[thisk] = 1;
				}
			});
			kcounts["~Total less decals"] = kcounts["~Total"] - kcounts["Decals"];
			return kcounts;
		};
		// count the switches
		// use ~Total instead of Total to force it to bottom when displeyed
		$scope.switchCount = function() {
			var scounts = new Object();
			scounts["~Total"] = 0;
			angular.forEach($scope.keys(), function(key) {
				if(!key.decal) {
					scounts["~Total"]++;
					var thissw = key.st || $scope.meta.switchType;
					if(thissw) {
						scounts[thissw] = (scounts[thissw] || 0) + 1;
					}
				}
			});
			return scounts;
		};

		// strip the colour string out of the switch color
		// todo: handle white or near-white since it will be invisible.
		$scope.getTextColor = function(butt) {
			if((butt.substring(0,1) == "~") || (butt.substring(0,1) == "D")) {
				return "#ffffff"; // leave the decals and totals lines alone
			}
			var hex1 = butt;
			var re = /.*\(/;
			var hex2 = hex1.replace(re, '');
			var re = /\).*/;
			hex1 = hex2.replace(re, '');
			return hex1;
		};

		// for printing the summary only. Modified from http://stackoverflow.com/questions/468881/print-div-id-printarea-div-only/7532581#7532581 answered Feb 27 '14 at 17:47
		$scope.printDiv = function(divName) {
			var printContents = document.getElementById(divName).innerHTML;
			document.getElementById("summary_print").innerHTML = printContents;
			document.getElementById("body_all").style.display = "none";
			document.getElementById("summary_print").style.display = "";
			window.print();
			document.getElementById("summary_print").innerHTML = "";
			document.getElementById("body_all").style.display = "";
			document.getElementById("summary_print").style.display = "none";
		};

		$scope.removeLegendsButtons = [
			{ label: "All", re: /.*/, tooltip: "Remove all the legends from all the keys. Does not remove decals." },
			{ label: "Alphas", re: /^[A-Za-z]$/, tooltip: "Remove the legends from all the Alphabetical keys." },
			{ label: "Numbers", re: /^[0-9]*$/, tooltip: "Remove the legends from all the Number keys." },
			{ label: "Punctuation", re: /^[\`\~\!\@\#\$\%\^\&\*\(\)\-\_\=\+\[\{\]\}\;\:\'\"\,\<\.\>\/\?\\\|]$/, tooltip: "Remove the legends from all the Punctuation keys." },
			{ label: "Function", re: /F\d\d?/, tooltip: "Remove the legends from all the Function keys." },
			{ label: "Specials", re: /<.*>/, tooltip: "Remove the special legends, like FontAwesome, WebFont, images, etc, and anything between them in the same slot." },
			{ label: "Others", re: /^[^A-Za-z0-9\`\~\!\@\#\$\%\^\&\*\(\)\-\_\=\+\[\{\]\}\;\:\'\"\,\<\.\>\/\?\\\|]$|^[A-Za-z\s][A-Za-z\s]+$|\&\#.*|\&.*?;/, tooltip: "Remove the legends from (almost) all the other keys except decals." },
			{ label: "Decals", re: /.*/, decals: true, tooltip: "Remove the legends from all the Decals." },
		];
		$scope.removeLegends = function(button) {
			var keys = $scope.selectedKeys.length > 0 ? $scope.selectedKeys : $scope.keys();
			transaction("remove-legends", function() {
				angular.forEach(keys, function(key) {
					if(key.decal === (!!button.decals)) {
						for(var i=0; i<12; i++) {
							if(key.labels[i]) {
								update(key,"labels",key.labels[i].replace(button.re,''),i); // should we wipe the textSize and textColor too?
								renderKey(key);
							}
						}
					}
				});
			});
		};

		var align = { hmask:0x0f, hcenter:0x00, left:0x01, right:0x02, vmask:0xf0, vcenter:0x00, top:0x10, bottom:0x20, center:0x00, };
		$scope.alignLegendsButtons = [
			{ label: "&#8598;", flags: align.left    | align.top     },
			{ label: "&#8593;", flags: align.hcenter | align.top     },
			{ label: "&#8599;", flags: align.right   | align.top     },
			{ label: "&#8592;", flags: align.left    | align.vcenter },
			{ label: "&#9679;", flags: align.hcenter | align.vcenter },
			{ label: "&#8594;", flags: align.right   | align.vcenter },
			{ label: "&#8601;", flags: align.left    | align.bottom  },
			{ label: "&#8595;", flags: align.hcenter | align.bottom  },
			{ label: "&#8600;", flags: align.right   | align.bottom  },
		];

		function moveLabel(key, from, to) {
			key.labels[to] = key.labels[from];
			key.labels[from] = '';
			key.textColor[to] = key.textColor[from];
			key.textColor[from] = '';
			key.textSize[to] = key.textSize[from];
			key.textSize[from] = 0;
		}

		function alignSingleRow(key, flags, left, middle, right) {
			var render = false;
			switch(flags) {
				case align.left:
					if(!key.labels[left]) { render = true; moveLabel(key, middle, left); moveLabel(key, right, middle); }
					if(!key.labels[left]) { render = true; moveLabel(key, middle, left); }
					break;
				case align.right:
					if(!key.labels[right]) { render = true; moveLabel(key, middle, right); moveLabel(key, left, middle); }
					if(!key.labels[right]) { render = true; moveLabel(key, middle, right); }
					break;
				case align.hcenter:
					if(key.labels[left] && !key.labels[middle] && !key.labels[right]) { render = true; moveLabel(key, left, middle); }
					if(key.labels[right] && !key.labels[middle] && !key.labels[left]) { render = true; moveLabel(key, right, middle); }
					break;
			}
			return render;
		}

		$scope.alignLegends = function(flags) {
			var keys = $scope.selectedKeys.length > 0 ? $scope.selectedKeys : $scope.keys();
			transaction("align-legends", function() {
				angular.forEach(keys, function(key) {
					if(!key.decal) {
						var render = false;
						for(var i = 0; i < 12; i += 3) // horizontal alignment
							render = alignSingleRow(key, flags & align.hmask, i, i+1, i+2) || render;
						for(var i = 0; i < 3; i += 1) // vertical alignment
							render = alignSingleRow(key, (flags & align.vmask) >> 4, i, i+3, i+6) || render;
						if(render) renderKey(key);
					}
				});
			});
		};

		$scope.unhideDecals = function() {
			var keys = $scope.selectedKeys.length > 0 ? $scope.selectedKeys : $scope.keys();
			transaction("unhide-decals", function() {
				angular.forEach(keys, function(key) {
					if(key.decal) {
						update(key,'decal',false);
						renderKey(key);
					}
				});
			});
		};

		$scope.moveFromId = null;
		$scope.moveToId = null;
		$scope.moveSingleLegends = function() {
			var keys = $scope.selectedKeys.length > 0 ? $scope.selectedKeys : $scope.keys();
			if($scope.moveFromId >= 0 && $scope.moveToId >= 0) {
				transaction("move-legends", function() {
					angular.forEach(keys, function(key) {
						if(!key.decal && key.labels[$scope.moveFromId] && !key.labels[$scope.moveToId]) {
							moveLabel(key, $scope.moveFromId, $scope.moveToId);
							renderKey(key);
						}
					});
				});
			}
		};

		// Helper function to select a single key
		function selectKey(key,event) {
			if(key) {
				// If SHIFT is held down, we want to *extend* the selection from the last
				// selected item to the new one.
				if(event.shiftKey && $scope.selectedKeys.length > 0) {
					// Get the indicies of all the selected keys
					var currentSel = $scope.selectedKeys.map(function(key) { return $scope.keys().indexOf(key); });
					currentSel.sort(function(a,b) { return parseInt(a) - parseInt(b); });
					var cursor = $scope.keys().indexOf(key);
					var anchor = $scope.keys().indexOf($scope.selectedKeys.last());
					$scope.selectedKeys.pop();
				}

				// If neither CTRL or ALT is held down, clear the existing selection state
				if(!event.ctrlKey && !event.altKey) {
					$scope.unselectAll();
				}

				// SHIFT held down: toggle the selection everything between the anchor & cursor
				if(anchor !== undefined && cursor !== undefined) {
					if(anchor > cursor) {
						for(var i = anchor; i >= cursor; --i) {
							selectKey($scope.keys()[i],{ctrlKey:true});
						}
					} else {
						for(var i = anchor; i <= cursor; ++i) {
							selectKey($scope.keys()[i],{ctrlKey:true});
						}
					}
					return;
				}

				// Modify the selection
				var ndx = $scope.selectedKeys.indexOf(key);
				if(ndx >= 0) { //deselect
					$scope.selectedKeys.splice(ndx,1);
					if($scope.selectedKeys.length<1) {
						$scope.multi = {};
					} else {
						$scope.multi = angular.copy($scope.selectedKeys.last());
					}
				} else { //select
					$scope.selectedKeys.push(key);
					$scope.multi = angular.copy(key);
				}
			}
		};

		// The serialized key data
		$scope.serialized = "";
		$scope.serializedObjects = [];

		// Known layouts/presets
		$scope.layouts = [
			{ "name" : "Blank Layout", "data" : [] },
			{ "name" : "ANSI 104", "data" : [
				["Esc",{"x":1},"F1","F2","F3","F4",{"x":0.5},"F5","F6","F7","F8",{"x":0.5},"F9","F10","F11","F12",{"x":0.25},"PrtSc","Scroll Lock","Pause\nBreak"],
				[{"y":0.5},"~\n`","!\n1","@\n2","#\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","_\n-","+\n=",{"w":2},"Backspace",{"x":0.25},"Insert","Home","PgUp",{"x":0.25},"Num Lock","/","*","-"],
				[{"w":1.5},"Tab","Q","W","E","R","T","Y","U","I","O","P","{\n[","}\n]",{"w":1.5},"|\n\\",{"x":0.25},"Delete","End","PgDn",{"x":0.25},"7\nHome","8\n↑","9\nPgUp",{"h":2},"+"],
				[{"w":1.75},"Caps Lock","A","S","D","F","G","H","J","K","L",":\n;","\"\n'",{"w":2.25},"Enter",{"x":3.5},"4\n←","5","6\n→"],
				[{"w":2.25},"Shift","Z","X","C","V","B","N","M","<\n,",">\n.","?\n/",{"w":2.75},"Shift",{"x":1.25},"↑",{"x":1.25},"1\nEnd","2\n↓","3\nPgDn",{"h":2},"Enter"],
				[{"w":1.25},"Ctrl",{"w":1.25},"Win",{"w":1.25},"Alt",{"w":6.25},"",{"w":1.25},"Alt",{"w":1.25},"Win",{"w":1.25},"Menu",{"w":1.25},"Ctrl",{"x":0.25},"←","↓","→",{"x":0.25,"w":2},"0\nIns",".\nDel"]
			] },
			{ "name" : "ANSI 104 (big-ass enter)", "data" : [
				["Esc",{"x":1},"F1","F2","F3","F4",{"x":0.5},"F5","F6","F7","F8",{"x":0.5},"F9","F10","F11","F12",{"x":0.25},"PrtSc","Scroll Lock","Pause\nBreak"],
				[{"y":0.5},"~\n`","!\n1","@\n2","#\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","_\n-","+\n=","|\n\\","Back Space",{"x":0.25},"Insert","Home","PgUp",{"x":0.25},"Num Lock","/","*","-"],
				[{"w":1.5},"Tab","Q","W","E","R","T","Y","U","I","O","P","{\n[","}\n]",{"w":1.5,"h":2,"w2":2.25,"h2":1,"x2":-0.75,"y2":1},"Enter",{"x":0.25},"Delete","End","PgDn",{"x":0.25},"7\nHome","8\n↑","9\nPgUp",{"h":2},"+"],
				[{"w":1.75},"Caps Lock","A","S","D","F","G","H","J","K","L",":\n;","\"\n'",{"x":5.75},"4\n←","5","6\n→"],
				[{"w":2.25},"Shift","Z","X","C","V","B","N","M","<\n,",">\n.","?\n/",{"w":2.75},"Shift",{"x":1.25},"↑",{"x":1.25},"1\nEnd","2\n↓","3\nPgDn",{"h":2},"Enter"],
				[{"w":1.25},"Ctrl",{"w":1.25},"Win",{"w":1.25},"Alt",{"w":6.25},"",{"w":1.25},"Alt",{"w":1.25},"Win",{"w":1.25},"Menu",{"w":1.25},"Ctrl",{"x":0.25},"←","↓","→",{"x":0.25,"w":2},"0\nIns",".\nDel"]
			] },
			{ "name" : "ISO 105", "data" : [
				["Esc",{"x":1},"F1","F2","F3","F4",{"x":0.5},"F5","F6","F7","F8",{"x":0.5},"F9","F10","F11","F12",{"x":0.25},"PrtSc","Scroll Lock","Pause\nBreak"],
				[{"y":0.5},"¬\n`","!\n1","\"\n2","£\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","_\n-","+\n=",{"w":2},"Backspace",{"x":0.25},"Insert","Home","PgUp",{"x":0.25},"Num Lock","/","*","-"],
				[{"w":1.5},"Tab","Q","W","E","R","T","Y","U","I","O","P","{\n[","}\n]",{"w":1.25,"w2":1.5,"h":2,"h2":1,"x":0.25,"x2":-0.25},"Enter",{"x":0.25},"Delete","End","PgDn",{"x":0.25},"7\nHome","8\n↑","9\nPgUp",{"h":2},"+"],
				[{"w":1.75},"Caps Lock","A","S","D","F","G","H","J","K","L",":\n;","@\n'","~\n#",{"x":4.75},"4\n←","5","6\n→"],
				[{"w":1.25},"Shift","|\n\\","Z","X","C","V","B","N","M","<\n,",">\n.","?\n/",{"w":2.75},"Shift",{"x":1.25},"↑",{"x":1.25},"1\nEnd","2\n↓","3\nPgDn",{"h":2},"Enter"],
				[{"w":1.25},"Ctrl",{"w":1.25},"Win",{"w":1.25},"Alt",{"w":6.25},"",{"w":1.25},"AltGr",{"w":1.25},"Win",{"w":1.25},"Menu",{"w":1.25},"Ctrl",{"x":0.25},"←","↓","→",{"x":0.25,"w":2},"0\nIns",".\nDel"]
			] },
			{ "name" : "Default 60%", "data" : [
				["~\n`","!\n1","@\n2","#\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","_\n-","+\n=",{"w":2},"Backspace"],
				[{"w":1.5},"Tab","Q","W","E","R","T","Y","U","I","O","P","{\n[","}\n]",{"w":1.5},"|\n\\"],
				[{"w":1.75},"Caps Lock","A","S","D","F","G","H","J","K","L",":\n;","\"\n'",{"w":2.25},"Enter"],
				[{"w":2.25},"Shift","Z","X","C","V","B","N","M","<\n,",">\n.","?\n/",{"w":2.75},"Shift"],
				[{"w":1.25},"Ctrl",{"w":1.25},"Win",{"w":1.25},"Alt",{"w":6.25},"",{"w":1.25},"Alt",{"w":1.25},"Win",{"w":1.25},"Menu",{"w":1.25},"Ctrl"]
			] },
			{ "name" : "ISO 60%", "data" : [
				["¬\n`","!\n1","\"\n2","£\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","_\n-","+\n=",{"w":2},"Backspace"],
				[{"w":1.5},"Tab","Q","W","E","R","T","Y","U","I","O","P","{\n[","}\n]",{"x":0.25,"w":1.25,"h":2,"w2":1.5,"h2":1,"x2":-0.25},"Enter"],
				[{"a":4,"w":1.75},"Caps Lock","A","S","D","F","G","H","J","K","L",":\n;","@\n'","~\n#"],
				[{"w":1.25},"Shift","|\n\\","Z","X","C","V","B","N","M","<\n,",">\n.","?\n/",{"w":2.75},"Shift"],
				[{"w":1.25},"Ctrl",{"w":1.25},"Win",{"w":1.25},"Alt",{"a":7,"w":6.25},"",{"a":4,"w":1.25},"AltGr",{"w":1.25},"Win",{"w":1.25},"Menu",{"w":1.25},"Ctrl"]
			] },
			{ "name" : "Default TKL", "data" : [
				["Esc",{"x":1},"F1","F2","F3","F4",{"x":0.5},"F5","F6","F7","F8",{"x":0.5},"F9","F10","F11","F12",{"x":0.25},"PrtSc","Scroll Lock","Pause\nBreak"],
				[{"y":0.5},"~\n`","!\n1","@\n2","#\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","_\n-","+\n=",{"w":2},"Backspace",{"x":0.25},"Insert","Home","PgUp"],
				[{"w":1.5},"Tab","Q","W","E","R","T","Y","U","I","O","P","{\n[","}\n]",{"w":1.5},"|\n\\",{"x":0.25},"Delete","End","PgDn"],
				[{"w":1.75},"Caps Lock","A","S","D","F","G","H","J","K","L",":\n;","\"\n'",{"w":2.25},"Enter"],
				[{"w":2.25},"Shift","Z","X","C","V","B","N","M","<\n,",">\n.","?\n/",{"w":2.75},"Shift",{"x":1.25},"↑"],
				[{"w":1.25},"Ctrl",{"w":1.25},"Win",{"w":1.25},"Alt",{"a":7,"w":6.25},"",{"a":4,"w":1.25},"Alt",{"w":1.25},"Win",{"w":1.25},"Menu",{"w":1.25},"Ctrl",{"x":0.25},"←","↓","→"]	
			] },
			{ "name" : "ISO TKL", "data" : [
				["Esc",{"x":1},"F1","F2","F3","F4",{"x":0.5},"F5","F6","F7","F8",{"x":0.5},"F9","F10","F11","F12",{"x":0.25},"PrtSc","Scroll Lock","Pause\nBreak"],
				[{"y":0.5},"¬\n`","!\n1","\"\n2","£\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","_\n-","+\n=",{"w":2},"Backspace",{"x":0.25},"Insert","Home","PgUp"],
				[{"w":1.5},"Tab","Q","W","E","R","T","Y","U","I","O","P","{\n[","}\n]",{"x":0.25,"w":1.25,"h":2,"w2":1.5,"h2":1,"x2":-0.25},"Enter",{"x":0.25},"Delete","End","PgDn"],
				[{"w":1.75},"Caps Lock","A","S","D","F","G","H","J","K","L",":\n;","@\n'","~\n#"],
				[{"w":1.25},"Shift","|\n\\","Z","X","C","V","B","N","M","<\n,",">\n.","?\n/",{"w":2.75},"Shift",{"x":1.25},"↑"],
				[{"w":1.25},"Ctrl",{"w":1.25},"Win",{"w":1.25},"Alt",{"a":7,"w":6.25},"",{"a":4,"w":1.25},"AltGr",{"w":1.25},"Win",{"w":1.25},"Menu",{"w":1.25},"Ctrl",{"x":0.25},"←","↓","→"]					
			] },
			{ "name" : "ABCDEF 60%", "data" : [
				["~\n`","!\n1","@\n2","#\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","_\n-","+\n=",{"w":2},"Backspace"],
				[{"w":1.5},"Tab","A","B","C","D","E","F","G","H","I","J","{\n[","}\n]",{"w":1.5},"|\n\\"],
				[{"w":1.75},"Caps Lock","K","L","M","N","O","P","Q","R","S",":\n;","\"\n'",{"w":2.25},"Enter"],
				[{"w":2.25},"Shift","T","U","V","W","X","Y","Z","<\n,",">\n.","?\n/",{"w":2.75},"Shift"],
				[{"w":1.25},"Ctrl",{"w":1.25},"Win",{"w":1.25},"Alt",{"a":7,w:6.25},"",{"a":4,"w":1.25},"Alt",{"w":1.25},"Win",{"w":1.25},"Menu",{"w":1.25},"Ctrl"]
			] },
			{ "name" : "JD40", "data" : [
				["Esc","Q","W","E","R","T","Y","U","I","O","P","Back<br>Space"],
				[{"w":1.25},"Tab","A","S","D","F","G","H","J","K","L",{"w":1.75},"Enter"],
				[{"w":1.75},"Shift","Z","X","C","V","B","N","M","<\n.",{"w":1.25},"Shift","Fn"],
				[{"w":1.25},"Hyper","Super","Meta",{"w":6.25},"",{"w":1.25},"Meta",{"w":1.25},"Super"]
			] },
			{ "name" : "ErgoDox", "data" : [
				[{"x":3.5},"#\n3",{"x":10.5},"*\n8"],
				[{"y":-0.875,"x":2.5},"@\n2",{"x":1},"$\n4",{"x":8.5},"&\n7",{"x":1},"(\n9"],
				[{"y":-0.875,"x":5.5},"%\n5","",{"x":4.5},"","^\n6"],
				[{"y":-0.875,"w":1.5},"","!\n1",{"x":14.5},")\n0",{"w":1.5},""],
				[{"y":-0.375,"x":3.5},"E",{"x":10.5},"I"],
				[{"y":-0.875,"x":2.5},"W",{"x":1},"R",{"x":8.5},"U",{"x":1},"O"],
				[{"y":-0.875,"x":5.5},"T",{"h":1.5},"",{"x":4.5,"h":1.5},"","Y"],
				[{"y":-0.875,"w":1.5},"","Q",{"x":14.5},"P",{"w":1.5},""],
				[{"y":-0.375,"x":3.5},"D",{"x":10.5},"K"],
				[{"y":-0.875,"x":2.5},"S",{"x":1},"F",{"x":8.5},"J",{"x":1},"L"],
				[{"y":-0.875,"x":5.5},"G",{"x":6.5},"H"],
				[{"y":-0.875,"w":1.5},"","A",{"x":14.5},":\n;",{"w":1.5},""],
				[{"y":-0.625,"x":6.5,"h":1.5},"",{"x":4.5,"h":1.5},""],
				[{"y":-0.75,"x":3.5},"C",{"x":10.5},"<\n,"],
				[{"y":-0.875,"x":2.5},"X",{"x":1},"V",{"x":8.5},"M",{"x":1},">\n."],
				[{"y":-0.875,"x":5.5},"B",{"x":6.5},"N"],
				[{"y":-0.875,"w":1.5},"","Z",{"x":14.5},"?\n/",{"w":1.5},""],
				[{"y":-0.375,"x":3.5},"",{"x":10.5},""],
				[{"y":-0.875,"x":2.5},"",{"x":1},"",{"x":8.5},"",{"x":1},""],
				[{"y":-0.75,"x":0.5},"","",{"x":14.5},"",""],
				[{"r":30,"rx":6.5,"ry":4.25,"y":-1,"x":1},"",""],
				[{"h":2},"",{"h":2},"",""],
				[{"x":2},""],
				[{"r":-30,"rx":13,"y":-1,"x":-3},"",""],
				[{"x":-3},"",{"h":2},"",{"h":2},""],
				[{"x":-3},""]
			] },
			{ "name" : "Atreus", "data" : [
				[{"r":10,"rx":1},{"y":0.5},"Q",{"y":-0.25},"W",{"y":-0.35},"E",{"y":0.35},"R",{"y":0.35},"T"],
				[{"y":-0.1},"A",{"y":-0.25},"S",{"y":-0.35},"D",{"y":0.35},"F",{"y":0.35},"G"],
				[{"y":-0.1},"Z",{"y":-0.25},"X",{"y":-0.35},"C",{"y":0.35},"V",{"y":0.35},"B"],
				[{"y":-0.1},"Esc",{"y":-0.25},"Tab",{"y":-0.35},"super",{"y":0.35},"Shift",{"y":0.35},"Bksp",{"y":-0.75,"h":1.5},"Ctrl"],
				[{"r":-10,"rx":7,"ry":0.965},{"y":0.5},"Y",{"y":-0.35},"U",{"y":-0.35},"I",{"y":0.35},"O",{"y":0.25},"P"],
				[{"y":0.1},"H",{"y":-0.35},"J",{"y":-0.35},"K",{"y":0.35},"L",{"y":0.25},":\n;"],
				[{"y":0.1},"N",{"y":-0.35},"M",{"y":-0.35},"<\n,",{"y":0.35},">\n.",{"y":0.25},"?\n/"],
				[{"y":-0.65,"x":-1,"h":1.5},"Alt",{"y":0.75},"Space",{"y":-0.35},"fn",{"y":-0.35},"_\n-",{"y":0.35},"\"\n'",{"y":0.25},"Enter"]
			] },
			{ "name" : "Planck", "data" : [
				[{"a":7},"Tab","Q","W","E","R","T","Y","U","I","O","P","Back Space"],
				["Esc","A","S","D","F","G","H","J","K","L",";","'"],
				["Shift","Z","X","C","V","B","N","M",",",".","/","Return"],
				["","Ctrl","Alt","Super","&dArr;",{"w":2},"","&uArr;","&larr;","&darr;","&uarr;","&rarr;"]		
			] },
			{ "name" : "Kinesis Advantage", "data" : [
				[{"f":1,"f2":2,"w":0.675,"h":0.85},"\nEsc",{"x":0.075,"w":0.675,"h":0.85},"\nF1",{"x":0.075,"w":0.675,"h":0.85},"\nF2",{"x":0.075,"w":0.675,"h":0.85},"\nF3",{"x":0.075,"w":0.675,"h":0.85},"\nF4",{"x":0.075,"w":0.675,"h":0.85},"\nF5",{"x":0.075,"w":0.675,"h":0.85},"\nF6",{"x":0.075,"w":0.675,"h":0.85},"\nF7",{"x":0.075,"w":0.675,"h":0.85},"\nF8",{"x":4.825,"w":0.675,"h":0.85},"Repeat Rate\nF9",{"x":0.075,"w":0.675,"h":0.85},"Disable Macro\nF10",{"x":0.075,"w":0.675,"h":0.85},"Macro\nF11",{"x":0.075,"w":0.675,"h":0.85},"Remap\nF12",{"x":0.075,"w":0.675,"h":0.85},"PrintScr SysReq",{"x":0.075,"w":0.675,"h":0.85},"Scroll<br>lock",{"x":0.075,"w":0.675,"h":0.85},"Pause Break",{"x":0.075,"w":0.675,"h":0.85},"Keypad",{"x":0.075,"w":0.675,"h":0.85},"Progrm"],
				[{"x":2.25,"f":3},"@\n2","#\n3","$\n4","%\n5",{"x":5.5},"^\n6","&\n7\n\n\nNm Lk","*\n8\n\n\n=","(\n9\n\n\n="],
				[{"y":-0.75,"w":1.25},"+\n=","!\n1",{"x":13.5},")\n0\n\n\n*",{"w":1.25},"_\n-"],
				[{"y":-0.25,"x":2.25,"f":6},"W","E","R","T",{"x":5.5},"Y","U\n\n\n\n7","I\n\n\n\n8","O\n\n\n\n9"],
				[{"y":-0.75,"f":3,"w":1.25},"\n\n\n\n\n\nTab",{"f":6},"Q",{"x":13.5},"P\n\n\n\n-",{"f":3,"w":1.25},"|\n\\"],
				[{"y":-0.25,"x":2.25,"f":6},"S","D","F","G",{"x":5.5},"H","J\n\n\n\n4","K\n\n\n\n5","L\n\n\n\n6"],
				[{"y":-0.75,"f":3,"w":1.25},"\n\n\n\n\n\nCaps<br>Lock",{"f":6},"A",{"x":13.5,"f":3},":\n;\n\n\n+",{"w":1.25},"\"\n'"],
				[{"y":-0.25,"x":2.25,"f":6},"X","C","V","B",{"x":5.5},"N","M\n\n\n\n1",{"f":3},"<\n,\n\n\n2",">\n.\n\n\n3"],
				[{"y":-0.75,"w":1.25},"\n\n\n\n\n\nShift",{"f":6},"Z",{"x":13.5,"f":3},"?\n/\n\n\nEnter",{"w":1.25},"\n\n\n\n\n\nShift"],
				[{"y":-0.25,"x":2.25},"|\n\\\n\n\nInsert",{"a":5,"f":5},"⇦\n\n\n\n⇦","⇨\n\n\n\n⇨",{"x":7.5},"⇧\n\n\n\n⇧","⇩\n\n\n\n⇩",{"a":4,"f":3},"{\n[\n\n\n."],
				[{"y":-0.75,"x":1.25},"~\n`",{"x":13.5},"}\n]\n\n\nEnter"],
				[{"r":15,"rx":5.25,"ry":4,"x":1.5},"Ctrl","Alt"],
				[{"x":0.5,"a":5,"h":2},"\n\n\n\n\n\nBack<br>Space",{"h":2},"\n\n\n\n\n\nDelete","\n\n\n\n\n\nHome"],
				[{"x":2.5},"\n\n\n\n\n\nEnd"],
				[{"r":-15,"rx":12.75,"x":-3.5,"a":4},"Cmd\n\n\n\n\n\nWin",{"a":5},"\n\n\n\n\n\nCtrl"],
				[{"x":-3.5,"a":6},"Page<br>Up",{"a":5,"h":2},"\n\n\n\n\n\nEnter",{"h":2},"\n\n\n\n\n\nSpace"],
				[{"x":-3.5,"a":6},"Page<br>Down"]
			] },
			{ "name" : "Keycool 84", "data" : [
				[{"a":6},"Esc","F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12",{"a":5},"PrtSc\nNmLk","Pause\nScrLk","Delete\nInsert"],
				[{"a":4},"~\n`","!\n1","@\n2","#\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","_\n-","+\n=",{"a":6,"w":2},"Backspace","Home"],
				[{"a":4,"w":1.5},"Tab","Q","W","E","R","T","Y","U","I","O","P","{\n[","}\n]",{"w":1.5},"|\n\\",{"a":6},"Page Up"],
				[{"a":4,"w":1.75},"Caps Lock","A","S","D","F","G","H","J","K","L",":\n;","\"\n'",{"a":6,"w":2.25},"Enter","Page Down"],
				[{"w":2.25},"Shift",{"a":4},"Z","X","C","V","B","N","M","<\n,",">\n.","?\n/",{"a":6,"w":1.75},"Shift",{"a":7},"↑",{"a":6},"End"],
				[{"w":1.25},"Ctrl",{"w":1.25},"Win",{"w":1.25},"Alt",{"w":6.25},"","Alt","Fn","Ctrl",{"a":7},"←","↓","→"]
			] },
			{ "name" : "Leopold FC660m", "data" : [
				["~\n`","!\n1","@\n2","#\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","_\n-","+\n=",{"w":2},"Backspace",{"x":0.5},"Insert"],
				[{"w":1.5},"Tab","Q","W","E","R","T","Y","U","I","O","P","{\n[","}\n]",{"w":1.5},"|\n\\",{"x":0.5},"Delete"],
				[{"w":1.75},"Caps Lock","A","S","D","F","G","H","J","K","L",":\n;","\"\n'",{"w":2.25},"Enter"],
				[{"w":2.25},"Shift","Z","X","C","V","B","N","M","<\n,",">\n.","?\n/",{"w":2.25},"Shift","↑"],
				[{"w":1.25},"Ctrl","Win",{"w":1.25},"Alt",{"w":6.25},"",{"w":1.25},"Alt",{"w":1.25},"Ctrl",{"w":1.25},"Menu","←","↓","→"]
			] }
		];
		$scope.samples = {
			"Apple Wireless" : [{"backcolor":"#dbdbdb","name":"Apple Wireless Keyboard","author":"Alistair Calder","radii":"6px 6px 12px 12px / 18px 18px 12px 12px","css":"@import url(http://fonts.googleapis.com/css?family=Varela+Round);\n\n#keyboard-bg { \n    background-image: linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 4%, rgba(255,255,255,0.3) 6%, rgba(0,0,0,0) 10%), \n                      linear-gradient(to right, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 100%) !important; \n}\n\n.keylabel {\n    font-family: 'volkswagen_serialregular';\n}\n\n/* Strangely, \"Volkswagen Serial\" doesn't have a tilde character */\n.varela { \n    font-family: 'Varela Round'; \n    display: inline-block; \n    font-size: inherit; \n    text-rendering: auto; \n    -webkit-font-smoothing: antialiased; \n    -moz-osx-font-smoothing: grayscale;\n    transform: translate(0, 0);\n}\n.varela-tilde:after { content: \"\\07e\"; }"},[{"y":0.75,"t":"#666666","p":"CHICKLET","a":7,"f":2,"w":1.0357,"h":0.75},"esc",{"a":4,"fa":[0,0,0,1],"w":1.0357,"h":0.75},"\n\n\nF1",{"w":1.0357,"h":0.75},"\n\n\nF2",{"w":1.0357,"h":0.75},"\n\n\nF3",{"w":1.0357,"h":0.75},"\n\n\nF4",{"w":1.0357,"h":0.75},"\n\n\nF5",{"w":1.0357,"h":0.75},"\n\n\nF6",{"w":1.0357,"h":0.75},"\n\n\nF7\n\n\n\n\n\n<i class='fa fa-backward'></i>",{"fa":[0,0,0,1,0,0,0,0,0,1],"w":1.0357,"h":0.75},"\n\n\nF8\n\n\n\n\n\n<i class='fa fa-play'></i><i class='fa fa-pause'></i>",{"fa":[0,0,0,1],"w":1.0357,"h":0.75},"\n\n\nF9\n\n\n\n\n\n<i class='fa fa-forward'></i>",{"w":1.0357,"h":0.75},"\n\n\nF10\n\n\n\n\n\n<i class='fa fa-volume-off'></i>",{"w":1.0357,"h":0.75},"\n\n\nF11\n\n\n\n\n\n<i class='fa fa-volume-down'></i>",{"w":1.0357,"h":0.75},"\n\n\nF12\n\n\n\n\n\n<i class='fa fa-volume-up'></i>",{"a":7,"w":1.0357,"h":0.75},"<i class='fa fa-eject'></i>"],[{"y":-0.25,"a":5,"f":5},"<i class=\"varela varela-tilde\"></i>\n`","!\n1","@\n2","#\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","_\n-","+\n=",{"a":4,"f":2,"w":1.5},"\n\n\ndelete"],[{"w":1.5},"\ntab",{"a":7,"f":5},"Q","W","E","R","T","Y","U","I","O","P",{"a":5},"{\n[","}\n]","|\n\\"],[{"a":4,"f":2,"fa":[1],"w":1.75},"<i class='kb kb-Multimedia-Record'></i>\ncaps lock",{"a":7,"f":5},"A","S","D",{"n":true},"F","G","H",{"n":true},"J","K","L",{"a":5},":\n;","\"\n'",{"a":4,"f":2,"fa":[0,0,1],"w":1.75},"\n\nenter\nreturn"],[{"w":2.25},"\nshift",{"a":7,"f":5},"Z","X","C","V","B","N","M",{"a":5},"<\n,",">\n.","?\n/",{"a":4,"f":2,"w":2.25},"\n\n\nshift"],[{"h":1.111},"\nfn",{"h":1.111},"\ncontrol",{"fa":[1],"h":1.111},"alt\noption",{"fa":[1,0,5],"w":1.25,"h":1.111},"\n\n⌘\ncommand",{"a":7,"w":5,"h":1.111},"",{"a":4,"fa":[5],"w":1.25,"h":1.111},"⌘\ncommand",{"fa":[5,0,1],"h":1.111},"\n\nalt\noption",{"x":1,"a":7,"f":5,"h":0.611},"↑"],[{"y":-0.5,"x":11.5,"h":0.6111},"←",{"h":0.6111},"↓",{"h":0.6111},"→"]],
			"GB: CCnG" : [[{"c":"#618a40","t":"#eee2d0","p":"DCS"},"Esc",{"x":1,"c":"#eee2d0","t":"#618a40"},"F1","F2","F3","F4",{"x":0.5,"c":"#618a40","t":"#eee2d0"},"F5","F6","F7","F8",{"x":0.5,"c":"#eee2d0","t":"#618a40"},"F9","F10","F11","F12",{"x":0.25,"c":"#618a40","t":"#eee2d0"},"PrtSc","Scroll Lock","Pause\nBreak"],[{"y":0.5},"~\n`",{"c":"#eee2d0","t":"#618a40"},"!\n1","@\n2","#\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","_\n-","+\n=",{"c":"#618a40","t":"#eee2d0","w":2},"Backspace",{"x":0.25},"Insert","Home","PgUp",{"x":0.25},"Num Lock","/","*","-"],[{"w":1.5},"Tab",{"c":"#eee2d0","t":"#618a40"},"Q","W","E","R","T","Y","U","I","O","P","{\n[","}\n]",{"c":"#618a40","t":"#eee2d0","w":1.5},"|\n\\",{"x":0.25},"Delete","End","PgDn",{"x":0.25,"c":"#eee2d0","t":"#618a40"},"7\nHome","8\n↑","9\nPgUp",{"c":"#618a40","t":"#eee2d0","h":2},"+"],[{"w":1.25,"w2":1.75,"l":true},"Caps Lock",{"x":0.5,"c":"#eee2d0","t":"#618a40"},"A","S","D",{"n":true},"F","G","H",{"n":true},"J","K","L",":\n;","\"\n'",{"c":"#618a40","t":"#eee2d0","w":2.25},"Enter",{"x":3.5,"c":"#eee2d0","t":"#618a40"},"4\n←","5","6\n→"],[{"c":"#618a40","t":"#eee2d0","w":2.25},"Shift",{"c":"#eee2d0","t":"#618a40"},"Z","X","C","V","B","N","M","<\n,",">\n.","?\n/",{"c":"#618a40","t":"#eee2d0","w":2.75},"Shift",{"x":1.25},"↑",{"x":1.25,"c":"#eee2d0","t":"#618a40"},"1\nEnd","2\n↓","3\nPgDn",{"c":"#618a40","t":"#eee2d0","h":2},"Enter"],[{"w":1.25},"Ctrl",{"w":1.25},"Win",{"w":1.25},"Alt",{"c":"#eee2d0","t":"#618a40","p":"DCS SPACE","a":7,"w":6.25},"",{"c":"#618a40","t":"#eee2d0","p":"DCS","a":4,"w":1.25},"Alt",{"w":1.25},"Win",{"w":1.25},"Menu",{"w":1.25},"Ctrl",{"x":0.25},"←","↓","→",{"x":0.25,"c":"#eee2d0","t":"#618a40","w":2},"0\nIns",".\nDel"]],
			"GB: Retro DSA" : [{"backcolor":"#222222"},[{"c":"#7b9b48","t":"#e4dedd","p":"DSA","a":7,"f":4},"ESC",{"x":1,"c":"#483527","f":3},"F1","F2","F3","F4",{"x":0.5,"c":"#733636"},"F5","F6","F7","F8",{"x":0.5,"c":"#483527"},"F9","F10","F11","F12",{"x":0.25,"c":"#733636"},"PRINT",{"f":2},"SCROLL LOCK",{"f":3},"PAUSE"],[{"y":0.5,"c":"#483527","a":5,"f":5},"~\n`","!\n1","@\n2","#\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","&mdash;\n&ndash;","+\n=",{"c":"#733636","a":7,"f":3,"w":2},"BACK SPACE",{"x":0.25},"INS","HOME","PAGE UP",{"x":0.25},"NUM LOCK",{"f":6},"/","*","&ndash;"],[{"f":3,"w":1.5},"TAB",{"c":"#483527","f":8},"Q","W","E","R","T","Y","U","I","O","P",{"a":5,"f":5},"{\n[","}\n]",{"w":1.5},"|\n\\",{"x":0.25,"c":"#733636","a":7,"f":3},"DEL","END","PAGE DOWN",{"x":0.25,"c":"#483527","f":8},"7","8","9",{"c":"#733636","f":6,"h":2},"+"],[{"f":3,"w":1.75},"CAPS LOCK",{"c":"#483527","f":8},"A","S","D",{"n":true},"F","G","H",{"n":true},"J","K","L",{"a":5,"f":5},":\n;","\"\n'",{"c":"#7b9b48","a":7,"f":3,"w":2.25},"RETURN",{"x":3.5,"c":"#483527","f":8},"4",{"n":true},"5","6"],[{"c":"#733636","f":3,"w":2.25},"SHIFT",{"c":"#483527","f":8},"Z","X","C","V","B","N","M",{"a":5,"f":5},"<\n,",">\n.","?\n/",{"c":"#733636","a":7,"f":3,"w":2.75},"SHIFT",{"x":1.25,"f":6},"&#9652;",{"x":1.25,"c":"#483527","f":8},"1","2","3",{"c":"#733636","f":3,"h":2},"ENTER"],[{"w":1.25},"CTRL",{"w":1.25},"WIN",{"w":1.25},"ALT",{"c":"#483527","p":"DSA SPACE","w":6.25},"",{"c":"#733636","p":"DSA","w":1.25},"ALT",{"w":1.25},"WIN",{"w":1.25},"MENU",{"w":1.25},"CTRL",{"x":0.25,"f":6},"&#9666;","&#9662;","&#9656;",{"x":0.25,"c":"#483527","f":8,"w":2},"0","."]],
			"Stealth Black" : [{"backcolor":"#222222"},[{"c":"#282828","t":"#aaaaaa","p":"DCS","a":7},"\n\n\n\nEsc",{"x":1},"\n\n\n\nF1","\n\n\n\nF2","\n\n\n\nF3","\n\n\n\nF4",{"x":0.5},"\n\n\n\nF5","\n\n\n\nF6","\n\n\n\nF7","\n\n\n\nF8",{"x":0.5},"\n\n\n\nF9","\n\n\n\nF10","\n\n\n\nF11","\n\n\n\nF12",{"x":0.25},"\n\n\n\nPrtScr","\n\n\n\nS.Lock","\n\n\n\nPause"],[{"y":0.5,"a":3},"\n\n\n\n&nbsp;~\n`&nbsp;","\n\n\n\n&nbsp;!\n1&nbsp;","\n\n\n\n&nbsp;@\n2&nbsp;","\n\n\n\n&nbsp;#\n3&nbsp;","\n\n\n\n&nbsp;$\n4&nbsp;","\n\n\n\n&nbsp;%\n5&nbsp;","\n\n\n\n&nbsp;^\n6&nbsp;","\n\n\n\n&nbsp;&\n7&nbsp;","\n\n\n\n&nbsp;*\n8&nbsp;","\n\n\n\n&nbsp;(\n9&nbsp;","\n\n\n\n&nbsp;)\n0&nbsp;","\n\n\n\n&nbsp;_\n-&nbsp;","\n\n\n\n&nbsp;+\n=&nbsp;",{"a":7,"w":2},"\n\n\n\nBackspace",{"x":0.25},"\n\n\n\nInsert","\n\n\n\nHome","\n\n\n\nPgUp",{"x":0.25},"\n\n\n\nN.Lock","\n\n\n\n/","\n\n\n\n*","\n\n\n\n-"],[{"w":1.5},"\n\n\n\nTab","\n\n\n\nQ","\n\n\n\nW","\n\n\n\nE","\n\n\n\nR","\n\n\n\nT","\n\n\n\nY","\n\n\n\nU","\n\n\n\nI","\n\n\n\nO","\n\n\n\nP",{"a":3},"\n\n\n\n&nbsp;{\n[&nbsp;","\n\n\n\n&nbsp;}\n]&nbsp;",{"w":1.5},"\n\n\n\n&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|\n\\&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;",{"x":0.25,"a":7},"\n\n\n\nDelete","\n\n\n\nEnd","\n\n\n\nPgDn",{"x":0.25,"a":3},"\n\n\n\n7\nHome","\n\n\n\n8\n↑","\n\n\n\n9\nPgUp",{"a":7,"h":2},"\n\n\n\n+"],[{"w":1.75},"\n\n\n\nCaps Lock","\n\n\n\nA","\n\n\n\nS","\n\n\n\nD",{"n":true},"\n\n\n\nF","\n\n\n\nG","\n\n\n\nH",{"n":true},"\n\n\n\nJ","\n\n\n\nK","\n\n\n\nL",{"a":3},"\n\n\n\n&nbsp;:\n;&nbsp;","\n\n\n\n&nbsp;\"\n'&nbsp;",{"a":7,"w":2.25},"\n\n\n\nEnter",{"x":3.5,"a":3},"\n\n\n\n4\n←","\n\n\n\n5","\n\n\n\n6\n→"],[{"a":7,"w":2.25},"\n\n\n\nShift","\n\n\n\nZ","\n\n\n\nX","\n\n\n\nC","\n\n\n\nV","\n\n\n\nB","\n\n\n\nN","\n\n\n\nM",{"a":3},"\n\n\n\n&nbsp;<\n,&nbsp;","\n\n\n\n&nbsp;>\n.&nbsp;","\n\n\n\n&nbsp;?\n/&nbsp;",{"a":7,"w":2.75},"\n\n\n\nShift",{"x":1.25},"\n\n\n\n↑",{"x":1.25,"a":3},"\n\n\n\n1\nEnd","\n\n\n\n2\n↓","\n\n\n\n3\nPgDn",{"a":7,"h":2},"\n\n\n\nEnter"],[{"w":1.25},"\n\n\n\nCtrl",{"w":1.25},"\n\n\n\nWin",{"w":1.25},"\n\n\n\nAlt",{"p":"DCS SPACE","w":6.25},"",{"p":"DCS","w":1.25},"\n\n\n\nAlt",{"w":1.25},"\n\n\n\nWin",{"w":1.25},"\n\n\n\nMenu",{"w":1.25},"\n\n\n\nCtrl",{"x":0.25},"\n\n\n\n←","\n\n\n\n↓","\n\n\n\n→",{"x":0.25,"a":3,"w":2},"\n\n\n\n&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;0\nIns&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;","\n\n\n\n&nbsp;.\nDel&nbsp;"]],
			"Televideo TS-800a" : [{"backcolor":"#151A21"},[{"x":0.25,"c":"#84877B","t":"#EFF5DE;","p":"DSA","a":5,"f":2},"<u>&nbsp;SET&nbsp;UP&nbsp;</u>\nNO SCROLL",{"a":7,"f":7},"F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11",{"f":2},"LINE INSERT","LINE DELETE","CHAR INSERT","CHAR DELETE",{"x":0.5},"LINE ERASE","PAGE ERASE","SEND"],[{"x":0.25,"c":"#2A3233","a":5},"LOC<br><u>&nbsp;&nbsp;&nbsp;ESC&nbsp;&nbsp;&nbsp;</u>\nESC",{"f":6},"!\n1","@\n2","#\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0","_\n-","+\n=","~\n`","|\n\\",{"a":7,"f":2},"BACK SPACE",{"x":0.5,"f":9},"7","8","9"],[{"x":0.25,"f":2,"w":1.5},"TAB",{"f":9},"Q","W","E","R","T","Y","U","I","O","P",{"a":5,"f":6},"[\n]",{"a":7,"f":2,"w":1.5},"LINE<br>FEED",{"x":0.75,"w":1.25},"CLEAR SPACE",{"x":0.5,"f":9},"4","5","6"],[{"c":"#84877B","f":2},"CTRL",{"c":"#2A3233"},"ALPHA LOCK",{"f":9},"A","S","D","F","G","H","J","K","L",{"a":5,"f":6},":\n;","\"\n'",{"c":"#84877B","a":7,"f":2,"w":2,"w2":0.75,"h2":2,"x2":1.25,"y2":-1},"RETURN","BREAK",{"x":0.75,"c":"#2A3233","f":9},"1","2","3"],[{"f":2},"BACK TAB",{"c":"#84877B","w":1.5},"SHIFT",{"c":"#2A3233","f":9},"Z","X","C","V","B","N","M",{"a":5,"f":6},"<\n,",">\n.","?\n/",{"c":"#84877B","a":7,"f":2,"w":1.5},"SHIFT",{"c":"#2A3233","a":5,"f":6},"}\n{",{"c":"#84877B","a":7,"f":2},"DEL",{"x":0.75,"c":"#2A3233","f":9},".","0",","],[{"x":1.25,"c":"#84877B","f":2},"PRINT","FUNCT",{"c":"#2A3233","f":1,"w":8,"p":"DSA SPACE"},"",{"c":"#84877B","f":2,"p":"DSA"},"HOME",{"f":7},"&darr;","&uarr;","&larr;","&rarr;",{"x":0.5,"f":2,"w":1.5},"ENTER",{"c":"#2A3233","f":9},"-"]],
			"Symbolics PN 364000" : [{"backcolor":"#B1B1A3"},[{"c":"#93928A","t":"#CCCCB7","p":"SA","a":7,"w":2},"FUNCTION",{"w":2},"ESCAPE",{"w":2},"REFRESH",{"f":8,"w":2},"&#9632;",{"w":2},"&#9679;",{"w":2},"&#9650;",{"f":3,"w":2},"CLEAR INPUT",{"w":2},"SUSPEND",{"w":2},"RESUME",{"w":2},"ABORT"],[{"w":2},"NETWORK",{"c":"#474644","f":9},"<b>:</b>",{"a":5,"f":7},"!\n1","@\n2","#\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0",{"f":6},"&mdash;\n&ndash;","+\n=","~\n'","{\n\\","}\n|",{"c":"#93928A","a":7,"f":3,"w":2},"HELP"],[{"w":2},"LOCAL",{"w":1.5},"TAB",{"c":"#474644","f":9},"Q","W","E","R","T","Y","U","I","O","P",{"a":5,"f":6},"[\n(","]\n)",{"c":"#93928A","a":7,"f":3},"BACK SPACE",{"w":1.5},"PAGE",{"w":2},"COMPLETE"],[{"w":2},"SELECT",{"w":1.75},"RUB OUT",{"c":"#474644","f":9},"A","S","D","F","G","H","J","K","L",{"a":5,"f":6},":\n;","\"\n'",{"c":"#93928A","a":7,"f":3,"w":2},"RETURN",{"w":1.25},"LINE",{"w":2},"END"],[{"t":"#474644"},"CAPS LOCK",{"w":1.25},"SYMBOL",{"w":2},"SHIFT",{"c":"#474644","t":"#CCCCB7","f":9},"Z","X","C","V","B","N","M",{"a":5,"f":6},"<\n,",">\n.","?\n/",{"c":"#93928A","t":"#474644","a":7,"f":3,"w":2},"SHIFT",{"w":1.25},"SYMBOL",{"w":1.25},"REPEAT",{"w":1.25},"MODE LOCK"],["HYPER","SUPER","META",{"w":1.75},"CONTROL",{"t":"#CCCCB7","p":"SA SPACE","w":9},"",{"t":"#474644","p":"SA","w":1.75},"CONTROL","META","SUPER","HYPER",{"t":"#CCCCB7","w":1.5},"SCROLL"]],
			"Symbolics SpaceCadet" : [{"backcolor":"#dbd3d3"},[{"c":"#0073a2","t":"#CCCCB7","p":"SA","a":7,"w":2},"MACRO",{"w":2},"TERMINAL",{"w":2},"QUOTE",{"w":2},"OVER<BR>STRIKE",{"w":2},"CLEAR<br>INPUT",{"w":2},"CLEAR<br>SCREEN",{"w":2},"HOLD<br>OUTPUT",{"w":2},"STOP<br>OUTPUT",{"w":2},"ABORT",{"w":2},"BREAK",{"w":2},"RESUME",{"w":2},"CALL"],[{"c":"#6e6d6b","f":4},"&#8544;","&#8545;",{"c":"#0073a2","f":3,"w":2},"SYSTEM",{"c":"#6e6d6b","a":5,"f":7},"±\n:","!\n1","@\n2","#\n3","$\n4","%\n5","^\n6","&\n7","*\n8","(\n9",")\n0",{"w":1.5},"&mdash;\n&ndash;",{"w":1.5},"+\n=","<\n{",">\n}",{"c":"#0073a2","a":7,"f":3,"w":2},"STATUS",{"c":"#6e6d6b","a":5,"f":8},"\n\n\n\n\n\n&#9757","\n\n\n\n\n\n&#9759;"],[{"a":7,"f":4},"&#8546;",{"p":"SA mono"},"&#8547;",{"c":"#0073a2","p":"SA","f":3,"w":2},"NETWORK",{"w":1.5},"TAB",{"c":"#6e6d6b","a":5,"f":7},"&#8743;\nQ","&#8744;\nW","&#8745;\nE","&#8746;\nR","&#8834;\nT","&#8835;\nY","&#8704;\nU","&#8734;\nI","&#8707;\nO","&#8706;\nP","[\n(","]\n)",{"f":6},"~\n`",{"w":1.5},"|\n\\",{"c":"#0073a2","a":7,"f":3,"w":2},"DELETE",{"c":"#6e6d6b","a":5,"f":8},"\n\n\n\n\n\n&#9756;","\n\n\n\n\n\n&#9758;"],[{"c":"#0073a2","a":7,"f":3,"w":2},"MODE<br>LOCK",{"w":2},"ALT MODE",{"w":1.75},"RUB OUT",{"c":"#6e6d6b","a":5,"f":7},"&#8869;\nA","&#8868;\nS","&#8866;\nD",{"n":true},"&#8867;\nF","&#8593;\nG","&#8595;\nH",{"n":true},"&#8592;\nJ","&#8594;\nK","&#8596;\nL",":\n;","\"\n'",{"c":"#0073a2","a":7,"f":3,"w":2},"RETURN",{"w":1.25},"LINE",{"w":2},"END",{"w":2},"HELP"],[{"t":"#212224"},"CAPS LOCK",{"w":1.5},"TOP",{"w":1.5},"GREEK",{"x":0.5,"w":1.25,"w2":2.25,"x2":-0.5,"l":true},"SHIFT",{"x":0.5,"c":"#6e6d6b","t":"#CCCCB7","a":5,"f":7},"&#8970;\nZ","&#8968;\nX","&#8800;\nC","&#8771;\nV","&#8801;\nB","&#8804;\nN","&#8805;\nM","<\n,",">\n.","?\n/",{"x":0.5,"c":"#0073a2","t":"#212224","a":7,"f":3,"w":1.25,"w2":2.25,"x2":-0.5,"l":true},"SHIFT",{"x":0.5,"w":1.5},"GREEK",{"w":1.5},"TOP",{"w":1.5},"REPEAT","MODE LOCK"],[{"w":1.5},"HYPER",{"w":1.5},"SUPER",{"w":1.5},"META",{"x":2.25,"t":"#CCCCB7","p":"SA SPACE","w":9},"",{"x":0.5,"t":"#212224","p":"SA","w":1.75},"CONTROL",{"x":1.5,"w":1.5},"META",{"w":1.5},"SUPER",{"w":1.5},"HYPER"],[{"rx":5,"ry":5,"x":-0.5,"w":1.75},"CONTROL"]],
			"Commodore VIC-20" : [{"backcolor":"#e8e1ca","css":"@font-face {\n  font-family: 'C64ProMono';\n  src: url(\"/fonts/C64_Pro_Mono-STYLE.eot\");\n  src: url(\"/fonts/C64_Pro_Mono-STYLE.eot?#iefix\") format('embedded-opentype'),\n       url(\"/fonts/C64_Pro_Mono-STYLE.woff\") format('woff'),\n       url(\"/fonts/C64_Pro_Mono-STYLE.ttf\") format('truetype'),\n       url(\"/fonts/C64_Pro_Mono-STYLE.svg#C64ProMono\") format('svg');\n  font-weight: normal;\n  font-style: normal;\n}\n\n.petscii {\n  display: inline-block;\n  font: normal normal normal 14px/1 C64ProMono;\n  font-size: inherit;\n  text-rendering: auto;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  transform: translate(0, 0);\n  border: solid 1px;\n}\n.keylabel9 .petscii , .keylabel10 .petscii , .keylabel11 .petscii {\n  font-size: 6px !important;\n}\n  \n.petscii-bar-bottom-left:after { content: \"\\0ee4c\"; }\n.petscii-bar-bottom-right:after { content: \"\\0ee7a\"; }\n.petscii-bar-horz-0:after { content: \"\\0ee63\"; } \n.petscii-bar-horz-1:after { content: \"\\0ee45\"; }\n.petscii-bar-horz-2:after { content: \"\\0ee44\"; }\n.petscii-bar-horz-3:after { content: \"\\0ee43\"; }\n.petscii-bar-horz-4:after { content: \"\\0ee46\"; }\n.petscii-bar-horz-5:after { content: \"\\0ee46\"; }\n.petscii-bar-horz-6:after { content: \"\\0ee52\"; }\n.petscii-bar-horz-7:after { content: \"\\0ee64\"; } \n.petscii-bar-top-left:after { content: \"\\0ee4f\"; }\n.petscii-bar-top-right:after { content: \"\\0ee50\"; }\n.petscii-bar-vert-0:after { content: \"\\0ee65\"; } \n.petscii-bar-vert-1:after { content: \"\\0ee54\"; }\n.petscii-bar-vert-2:after { content: \"\\0ee47\"; }\n.petscii-bar-vert-3:after { content: \"\\0ee42\"; }\n.petscii-bar-vert-4:after { content: \"\\0ee42\"; }\n.petscii-bar-vert-5:after { content: \"\\0ee48\"; }\n.petscii-bar-vert-6:after { content: \"\\0ee59\"; }\n.petscii-bar-vert-7:after { content: \"\\0ee67\"; } \n.petscii-block-horz-0:after { content: \"\\0ee63\"; } \n.petscii-block-horz-1:after { content: \"\\0ee77\"; } \n.petscii-block-horz-2:after { content: \"\\0ee78\"; } \n.petscii-block-horz-3:after { content: \"\\0ee62\"; } \n.petscii-block-horz-4:after { content: \"\\0ee79\"; } \n.petscii-block-horz-5:after { content: \"\\0ee6f\"; } \n.petscii-block-horz-6:after { content: \"\\0ee64\"; } \n.petscii-block-vert-0:after { content: \"\\0ee65\"; } \n.petscii-block-vert-1:after { content: \"\\0ee74\"; } \n.petscii-block-vert-2:after { content: \"\\0ee75\"; } \n.petscii-block-vert-3:after { content: \"\\0ee61\"; } \n.petscii-block-vert-4:after { content: \"\\0ee76\"; } \n.petscii-block-vert-5:after { content: \"\\0ee6a\"; } \n.petscii-block-vert-6:after { content: \"\\0ee67\"; } \n.petscii-checkerboard:after { content: \"\\0ee7f\"; } \n.petscii-circle-filled:after { content: \"\\0ee51\"; }\n.petscii-circle-open:after { content: \"\\0ee57\"; }\n.petscii-club:after { content: \"\\0ee58\"; }\n.petscii-corner-round-bottom-left:after { content: \"\\0ee49\"; }\n.petscii-corner-round-bottom-right:after { content: \"\\0ee55\"; }\n.petscii-corner-round-top-left:after { content: \"\\0ee4b\"; }\n.petscii-corner-round-top-right:after { content: \"\\0ee4a\"; }\n.petscii-corner-square-bottom-left-filled:after { content: \"\\0ee7b\"; } \n.petscii-corner-square-bottom-left:after { content: \"\\0ee6e\"; } \n.petscii-corner-square-bottom-right-filled:after { content: \"\\0ee6c\"; } \n.petscii-corner-square-bottom-right:after { content: \"\\0ee70\"; } \n.petscii-corner-square-top-left-filled:after { content: \"\\0ee7e\"; } \n.petscii-corner-square-top-left:after { content: \"\\0ee7d\"; } \n.petscii-corner-square-top-right-filled:after { content: \"\\0ee7c\"; } \n.petscii-corner-square-top-right:after { content: \"\\0ee6d\"; } \n.petscii-cross-diag:after { content: \"\\0ee56\"; }\n.petscii-cross:after { content: \"\\0ee5b\"; }\n.petscii-diag-bottom-top-filled:after { content: \"\\0ee69\"; }\n.petscii-diag-bottom-top:after { content: \"\\0ee4e\"; }\n.petscii-diag-top-bottom-filled:after { content: \"\\0ee5f\"; } \n.petscii-diag-top-bottom:after { content: \"\\0ee4d\"; }\n.petscii-diamond:after { content: \"\\0ee5a\"; }\n.petscii-halftone-bottom:after { content: \"\\0ee68\"; } \n.petscii-halftone-left:after { content: \"\\0ee5c\"; }\n.petscii-halftone:after { content: \"\\0ee66\"; }\n.petscii-heart:after { content: \"\\0ee53\"; }\n.petscii-spade:after { content: \"\\0ee41\"; }\n.petscii-tbar-down:after { content: \"\\0ee72\"; } \n.petscii-tbar-left:after { content: \"\\0ee73\"; } \n.petscii-tbar-right:after { content: \"\\0ee6b\"; } \n.petscii-tbar-up:after { content: \"\\0ee71\"; }"},[{"x":0.25,"c":"#413c2c","t":"#f1ecda","p":"SA R1","a":7,"f":7},"←",{"a":5},"!\n1\n\n\nBLK",{"f":9,"f2":7},"\"\n2\n\n\nWHT",{"f":5,"f2":7},"#\n3\n\n\nRED","$\n4\n\n\nCYN",{"f":7},"%\n5\n\n\nPUR",{"f":6,"f2":7},"&\n6\n\n\nGRN",{"f":9,"f2":7},"’\n7\n\n\nBLU",{"f":7},"(\n8\n\n\nYEL",")\n9\n\n\nRVS ON","\n0\n\n\nRVS OFF",{"f":9,"a":7},"+\n\n\n\n<i class='petscii petscii-halftone'></i> <i class='petscii petscii-cross'></i>","-\n\n\n\n<i class='petscii petscii-halftone-left'></i> <i class='petscii petscii-bar-vert-4'></i>","£\n\n\n\n<i class='petscii petscii-halftone-bottom'></i> <i class='petscii petscii-diag-bottom-top-filled'></i>",{"f":5,"a":5},"CLR\nHOME","INST\nDEL",{"x":1.25,"c":"#e9bf69","f":9,"w":1.5,"a":7},"f 1\n\n\n\nf 2"],[{"x":0.25,"c":"#413c2c","p":"SA R2","f":4,"w":1.5,"a":7},"C T R L",{"f":7},"Q\n\n\n\n<i class='petscii petscii-tbar-right'></i> <i class='petscii petscii-circle-filled'></i>","W\n\n\n\n<i class='petscii petscii-tbar-left'></i> <i class='petscii petscii-circle-open'></i>","E\n\n\n\n<i class='petscii petscii-tbar-up'></i> <i class='petscii petscii-bar-horz-1'></i>","R\n\n\n\n<i class='petscii petscii-tbar-down'></i> <i class='petscii petscii-bar-horz-6'></i>","T\n\n\n\n<i class='petscii petscii-bar-horz-0'></i> <i class='petscii petscii-bar-vert-1'></i>","Y\n\n\n\n<i class='petscii petscii-block-horz-1'></i> <i class='petscii petscii-bar-vert-6'></i>","U\n\n\n\n<i class='petscii petscii-block-horz-2'></i> <i class='petscii petscii-corner-round-bottom-right'></i>","I\n\n\n\n<i class='petscii petscii-block-horz-3'></i> <i class='petscii petscii-corner-round-bottom-left'></i>","O\n\n\n\n<i class='petscii petscii-block-horz-4'></i> <i class='petscii petscii-bar-top-left'></i>","P\n\n\n\n<i class='petscii petscii-block-horz-5'></i> <i class='petscii petscii-bar-top-right'></i>","@\n\n\n\n<i class='petscii petscii-bar-horz-7'></i> <i class='petscii petscii-bar-bottom-right'></i>",{"f":9},"*\n\n\n\n<i class='petscii petscii-diag-top-bottom-filled'></i> <i class='petscii petscii-bar-horz-4'></i>",{"f":7},"↑\n\n\n\nπ",{"f":4,"w":1.5},"RESTORE",{"x":1.25,"c":"#e9bf69","f":9,"w":1.5},"f 3\n\n\n\nf 4"],[{"c":"#413c2c","p":"SA R4","f":3},"RUN STOP","SHIFT LOCK",{"f":7},"A\n\n\n\n<i class='petscii petscii-corner-square-bottom-right'></i> <i class='petscii petscii-spade'></i>","S\n\n\n\n<i class='petscii petscii-corner-square-bottom-left'></i> <i class='petscii petscii-heart'></i>","D\n\n\n\n<i class='petscii petscii-corner-square-bottom-right-filled'></i> <i class='petscii petscii-bar-horz-2'></i>","F\n\n\n\n<i class='petscii petscii-corner-square-bottom-left-filled'></i> <i class='petscii petscii-bar-horz-5'></i>","G\n\n\n\n<i class='petscii petscii-bar-vert-0'></i> <i class='petscii petscii-bar-vert-2'></i>","H\n\n\n\n<i class='petscii petscii-block-vert-1'></i> <i class='petscii petscii-bar-vert-5'></i>","J\n\n\n\n<i class='petscii petscii-block-vert-2'></i> <i class='petscii petscii-corner-round-top-right'></i>","K\n\n\n\n<i class='petscii petscii-block-vert-3'></i> <i class='petscii petscii-corner-round-top-left'></i>","L\n\n\n\n<i class='petscii petscii-block-vert-4'></i> <i class='petscii petscii-bar-bottom-left'></i>",{"f":6,"a":5},"[\n:","]\n;",{"f":7,"a":7},"=",{"f":4,"w":2},"RETURN",{"x":1.5,"c":"#e9bf69","f":9,"w":1.5},"f 5\n\n\n\nf6"],[{"c":"#413c2c","p":"SA R5","f":7},"C=",{"f":4,"w":1.5},"S H I F T",{"f":7},"Z\n\n\n\n<i class='petscii petscii-corner-square-top-right'></i> <i class='petscii petscii-diamond'></i>","X\n\n\n\n<i class='petscii petscii-corner-square-top-left'></i> <i class='petscii petscii-club'></i>","C\n\n\n\n<i class='petscii petscii-corner-square-top-right-filled'></i> <i class='petscii petscii-bar-horz-3'></i>","V\n\n\n\n<i class='petscii petscii-corner-square-top-left-filled'></i> <i class='petscii petscii-cross-diag'></i>","B\n\n\n\n<i class='petscii petscii-checkerboard'></i> <i class='petscii petscii-bar-vert-3'></i>","N\n\n\n\n<i class='petscii petscii-block-vert-5'></i> <i class='petscii petscii-diag-bottom-top'></i>","M\n\n\n\n<i class='petscii petscii-bar-vert-7'></i> <i class='petscii petscii-diag-top-bottom'></i>",{"f":6,"a":5},"<\n,",">\n.","?\n/",{"f":4,"w":1.5,"a":7},"S H I F T",{"f":3,"a":5},"&#x021d1;\n&#x021d3;\n\n\n\n\nCRSR","&#x021d0;\n&#x021d2;\n\n\n\n\nCRSR",{"x":1.5,"c":"#e9bf69","f":9,"w":1.5,"a":7},"f 7\n\n\n\nf 8"],[{"x":2.75,"c":"#413c2c","p":"SA SPACE","a":4,"f":3,"w":9},""]],
			"Programmer's Keyboard": [{"name":"Programmer's Keyboard 1.99","author":"Ian Douglas","background":{"name":"Mahogany Red","style":"background-image: url('/bg/wood/Red_Mahogany_Wood.jpg');"},"radii":"30px 30px 50% 50%","switchMount":"cherry","switchBrand":"cherry","switchType":"MX1A-G1xx","plate":true,"pcb":false},[{"x":23,"a":7,"d":true},""],[{"y":-0.62,"x":1.25,"c":"#857eb1","a":4,"f":6},"\n<img src='http://i.imgur.com/QtgaNKa.png' width='20'>",{"c":"#b81b24","a":5,"f":5,"f2":3},"<img src=\"http://i.imgur.com/NSggfPa.png\" width=\"15\">\n ","<img src=\"http://i.imgur.com/NSggfPa.png\" width=\"15\">\n",{"x":0.75,"c":"#d9dae0","a":4,"f":3},"\nF1 ","\nF2","\nF3","\nF4",{"x":1},"\nF5","\nF6","\nF7","\nF8",{"x":1},"\nF9","\nF10","\nF11","\nF12",{"x":0.75,"c":"#857eb1","t":"#000000\n\n\n\n\n\n\n#0000ff","f":5},"\n⎙\n\n\n\n\n\n",{"c":"#c4c8c5","t":"#000000","f":3,"f2":6},"\n<i class=\"fa fa-lock\"></i>⇳",{"c":"#857eb1","t":"#000000\n\n\n\n\n\n\n#0000ff","fa":[0,0,6,6,6,6,6,6]},"\n\n\n\n\n\n\n"],[{"y":0.07000000000000006,"x":10,"c":"#cccccc","t":"#B22222","a":5,"d":true},"<i class=\"fa fa-circle\"></i>\n\n\n\n\n\n<img src=\"http://i.imgur.com/nUkQS0u.png\" width=\"15\">"],[{"y":-0.9700000000000002,"x":11,"c":"#d9dae0","t":"#32CD32\n\n\n\n\n\n#fdd017","d":true},"<i class=\"fa fa-circle\"></i>\n\n\n\n\n\n<i class=\"fa fa-lock\"></i>",{"t":"#ffffff\n\n\n\n\n\n#fdd017","fa":[0,0,6,6,6,6,4],"d":true},"<i class=\"fa fa-circle\"></i>\n\n\n\n\n\n⇳",{"t":"#0000CD\n\n\n\n\n\n#fdd017","d":true},"<i class=\"fa fa-circle\"></i>\n\n\n\n\n\n▮"],[{"y":-0.3500000000000001,"x":9.5,"c":"#c7c3b4","t":"#000000","a":4,"f2":5},"\n[",{"c":"#95bfe8"},"\n7","\n8","\n9",{"c":"#c7c3b4"},"\n]"],[{"x":9.5},"\n(",{"c":"#95bfe8"},"\n4",{"n":true},"\n5","\n6",{"c":"#c7c3b4"},"\n)"],[{"x":9.5},"\n{",{"c":"#95bfe8"},"\n1","\n2","\n3",{"c":"#c7c3b4"},"\n}"],[{"x":9.5},"\n<",{"c":"#95bfe8","t":"#7f007f\n#000","f":2,"f2":3},"<i class=\"fa fa-volume-off\"></i>\n0","\n00","\n000",{"c":"#c7c3b4","t":"#000000","f2":5},"\n>"],[{"x":9.5,"c":"#95bfe8","t":"#7f007f\n#000\n\n\n#f00\n#f00","a":0,"f":3,"f2":5},"<i class=\"fa fa-volume-down\"></i>\n-\n\n\n-\n_",{"t":"#7f007f\n#000","a":4},"<i class=\"fa fa-volume-up\"></i>\n+",{"f":2,"f2":5},"\n=","\n*","\n/"],[{"y":0.25,"x":9.5,"c":"#c4c8c5","t":"#000000"},"\n⇞","\n↶",{"f2":4},"\n<i class=\"fa fa-file-o\"></i>",{"f2":5},"\n↷",{"f":3},"\n⌦"],[{"y":1.7763568394002505e-15,"x":9.5,"f2":5},"\n⇟","\n","\n","\n",{"f":5},"\n⌶ ▮"],[{"x":9.5,"a":7,"w":5,"h":0.5,"d":true},""],[{"y":0.9199999999999999,"x":10.75,"c":"#cccccc","a":4,"f":3,"d":true},"<img src='http://i.imgur.com/Xfg6T0f.png' width='100'>"],[{"r":15,"y":-11.450000000000001,"x":3,"c":"#c7c3b4","f2":5},"0\n`"],[{"y":-0.9999999999999997,"x":4},"1\n!","2\n@",{"t":"#000000\n\n\n\n\n\n\n#0000ff"},"3\n#\n\n\n\n\n\n₤","4\n$\n\n\n\n\n\n¥","5\n%\n\n\n\n\n\n€"],[{"x":2.5,"c":"#c4c8c5","t":"#000000","f":3,"w":1.5},"⌫\n⌦",{"c":"#e5dbca","t":"#000000\n\n\n\n#f00","a":0,"fa":[0,0,5,5,5]},"Q\nq\n\n\nQ","D\nd\n\n\nW","R\nr\n\n\nE","W\nw\n\n\nR","B\nb\n\n\nT",{"c":"#c7c3b4","t":"#000000","a":4,"f2":5},"\n'"],[{"x":2.5,"c":"#c4c8c5","f":9,"w":1.5},"←\n→",{"c":"#e5dbca","t":"#000000\n\n\n\n#f00\n\n\n#0000ff","a":0,"f":3},"A\na\n\n\nA\n\n\n<i class=\"fa fa-file-o\"></i>",{"t":"#000000\n\n\n\n#f00"},"S\ns\n\n\nS","H\nh\n\n\nD",{"n":true},"T\nt\n\n\nF","G\ng\n\n\nG",{"c":"#c7c3b4","t":"#000000","a":4,"f2":9},"\n,"],[{"x":2.5,"c":"#c4c8c5","f2":6,"w":1.5},"<i class=\"fa fa-lock\"></i> <i class=\"fa fa-unlock\"></i>\n⇧",{"c":"#e5dbca","t":"#000000\n\n#0000ff\n\n#f00\n\n\n#0000ff","a":0,"fa":[0,0,0,6,6]},"Z\nz\n↷\n\nZ\n\n\n↶",{"t":"#000000\n\n\n\n#f00\n\n\n#0000ff"},"X\nx\n\n\nX\n\n\n",{"t":"#000000\n\n\n\n#f00"},"M\nm\n\n\nC",{"t":"#000000\n\n\n\n#f00\n\n\n#0000ff"},"C\nc\n\n\nV\n\n\n","V\nv\n\n\nB\n\n\n",{"c":"#00833e","t":"#00000","a":4,"f2":9,"h":2},"\n⏎"],[{"x":2.5,"c":"#c4c8c5","t":"#000000\n#0000ff","w":1.5},"\n⎈",{"c":"#857eb1","t":"#000000","f2":5},"\n",{"c":"#45b866"},"\n⇱",{"c":"#857eb1","f":5,"w":1.5},"☰\n",{"c":"#c4c8c5","f":3,"f2":7,"w":1.5},"\n⎇"],[{"x":4,"c":"#45b866","f2":5},"\n⇤","\n⇲","\n⇥",{"x":0.25,"c":"#e5dbca","a":7,"w":2.75},""],[{"r":-15,"y":0.1800000000000006,"x":14.15,"c":"#c7c3b4","a":4},"6\n^","7\n&",{"t":"#000000\n\n\n\n\n\n\n#0000ff"},"8\n\\\n\n\n\n\n\nɃ",{"t":"#000000"},"9\n_","0\n~",{"c":"#857eb1"},"\nf(x)"],[{"y":-1.7763568394002505e-15,"x":13.15,"c":"#c7c3b4"},"\n\"",{"c":"#e5dbca","t":"#000000\n\n\n\n#f00","a":0,"fa":[0,0,5,5,5]},"J\nj\n\n\nY","F\nf\n\n\nU","U\nu\n\n\nI","P\np\n\n\nO",{"c":"#c7c3b4"},"\n|\n\n\nP",{"c":"#c4c8c5","t":"#000000","a":4,"w":1.5},"⌦\n⌫"],[{"x":13.15,"c":"#c7c3b4","f2":9},"\n.",{"c":"#e5dbca","t":"#000000\n\n\n\n#f00","a":0,"fa":[0,0,9,9,9]},"Y\ny\n\n\nH",{"n":true},"N\nn\n\n\nJ","E\ne\n\n\nK","O\no\n\n\nL",{"t":"#000000\n\n\n\n#f00\n#f00","fa":[0,0,9,9,9,9]},"I\ni\n\n\n;\n:",{"c":"#c4c8c5","t":"#000000","a":4,"f":9,"w":1.5},"→\n←"],[{"x":13.15,"c":"#00833e","f":5,"f2":9,"h":2},"\n⏎",{"c":"#e5dbca","t":"#000000\n\n\n\n#f00","a":0,"f":3},"K\nk\n\n\nN","L\nl\n\n\nM",{"c":"#c7c3b4","t":"#000000\n\n\n\n#f00\n#f00","fa":[0,5,0,0,5,5]},"\n:\n\n\n,\n<","\n?\n\n\n.\n>","\n;\n\n\n/\n?",{"c":"#c4c8c5","t":"#000000","a":4,"f2":6,"w":1.5},"<i class=\"fa fa-lock\"></i> <i class=\"fa fa-unlock\"></i>\n⇧"],[{"x":14.15,"c":"#909596","f2":7,"w":1.5},"\n⎇",{"c":"#857eb1","f":5,"w":1.5},"☰\n",{"c":"#45b866","f":3,"f2":6},"\n↑",{"c":"#857eb1","f2":5},"\n",{"c":"#c4c8c5","t":"#000000\n#0000ff","f2":9,"w":1.5},"\n⎈"],[{"x":13.13,"c":"#e5dbca","t":"#000000","a":7,"w":2.75},"",{"x":0.2699999999999978,"c":"#45b866","a":4,"f2":6},"\n←","\n↓","\n→"]]
			};
		// $http.get('layouts.json').success(function(data) {
			// $scope.layouts = data.presets;
			// $scope.samples = data.samples;
		// });

		// Known backgrounds
		$scope.backgrounds = {};
		$http.get('backgrounds.json').success(function(data) {
			$scope.backgrounds = data;
		});

		$http.get('switches.json').success(function(data) {
			$scope.switches = data;
			$scope.switchNames = {};
			for(var mountName in $scope.switches) {
				var mountType = $scope.switches[mountName];
				for(var brandName in mountType.brands) {
					var brandType = mountType.brands[brandName];
					for(var part in brandType.switches) {
						var switchType = brandType.switches[part];
						$scope.switchNames[part] = brandType.name + " / " + switchType.name;
					}
				}
			}
		});

		// The currently selected palette & character-picker
		$scope.palette = {};
		$scope.picker = {};
		$scope.pickerSelection = {};

		var reverseColors = {}; // array to provide fast reverse lookups of colour names for Summary.
		                        // might be an issue if a colour features twice... only last will stick
		// The set of known palettes
		$scope.palettes = {};
		$http.get('colors.json').success(function(data) {
			$scope.palettes = data;
			$scope.palettes.forEach(function(palette) {
				palette.colors.forEach(function(color) {
					color.css = $color.sRGB8(color.r,color.g,color.b).hex();
					reverseColors[color.css] = palette.name + " " + color.name;
				});
			});
		});

		// The set of known character pickers
		$scope.pickers = {};
		$http.get('pickers.json').success(function(data) {
			$scope.pickers = data;
		});

		// A set of "known special" keys
		$scope.specialKeys = {};
		$http.get('keys.json').success(function(data) {
			$scope.specialKeys = data;
		});

		// Helper to calculate the height of the keyboard layout; cached to improve performance.
		$scope.kbHeight = 0;
		$scope.calcKbHeight = function() {
			var right = 0, bottom = 0;
			$scope.keys().forEach(function(key) {
				right = Math.max(right, key.bbox.x2);
				bottom = Math.max(bottom, key.bbox.y2);
			});
			$scope.kbWidth = right;
			$scope.kbHeight = bottom;
			$scope.kbFullHeight = bottom;
			if($scope.keyboard.meta.name || $scope.keyboard.meta.author)
				$scope.kbFullHeight += 32;
		};

		function updateFromCss(css) {
			var rules = $cssParser.parse(css);
			$scope.customGlyphs = $renderKey.getGlyphsFromRules(rules); // glyphs first, before rules are modified!
			$scope.customStyles = $sce.trustAsHtml($renderKey.sanitizeCssRules(rules));
			if($scope.picker.sentinel === userGlyphsSentinel) {
				$scope.picker.glyphs = $scope.customGlyphs;
			}
		}

		// Given a key, generate the HTML needed to render it
		function renderKey(key) {
			key.html = $sce.trustAsHtml($renderKey.html(key,$sanitize));
		}

		$scope.deserializeAndRender = function(data, skipMetadata) {
			$scope.serializedObjects = data; // cache serialized objects
			var backup = angular.copy($scope.keyboard.meta);
			$scope.keyboard = $serial.deserialize(data);
			$scope.keys().forEach(function(key) {
				renderKey(key);
			});
			if(skipMetadata) {
				// Use backup metadata
				var defaults = $serial.defaultMetaData();
				for(var k in backup) {
					if(backup.hasOwnProperty(k) && $scope.keyboard.meta[k] === defaults[k]) {
						$scope.keyboard.meta[k] = backup[k];
					}
				}
			}
			$scope.meta = angular.copy($scope.keyboard.meta);
			updateFromCss($scope.meta.css || '');
		};

		function updateSerialized() {
			//$timeout.cancel(serializedTimer); // this is slow, for some reason
			$scope.deserializeException = "";
			$scope.serializedObjects = $serial.serialize($scope.keyboard);
			$scope.serialized = toJsonPretty($scope.serializedObjects);
		}

		$scope.$on('$locationChangeStart', function(event, newUrl, oldUrl) {
			if($location.path() === '') {
				event.preventDefault();
			}
		});

		function loadAndRender(path) {
			if(path.substring(0,7) === '/gists/') {
				// Load Gists from Github
				github(path).success(function(data) {
					var json = "", css = "", notes = "";
					for(var fn in data.files) {
						if(fn.indexOf(".kbd.json")>=0) {
							json = data.files[fn].content;
						} else if(fn.indexOf(".style.css")>=0) {
							css = data.files[fn].content;
						} else if(fn.indexOf(".notes.md")>=0) {
							notes = data.files[fn].content;
						}
					}

					$scope.deserializeAndRender(jsonl.parse(json));
					if(css) {
						updateFromCss($scope.meta.css = css);
						$scope.keyboard.meta.css = $scope.meta.css;
					}
					if(notes) {
						$scope.keyboard.meta.notes = $scope.meta.notes = notes;
					}
					updateSerialized();
					$scope.loadError = false;
					setGist(data);
				}).error(function() {
					$scope.loadError = true;
					setGist(null);
				});

			} else {
				// Saved layouts & samples
				var base = $serial.base_href;
				if(path.substring(0,9) === '/samples/') {
					base = ''; // Load samples from local folder
				}
				$http.get(base + path).success(function(data) {
					$scope.deserializeAndRender(data);
					updateSerialized();
					$scope.loadError = false;
				}).error(function() {
					$scope.loadError = true;
				});
			}
		}

		$renderKey.init();
		$scope.deserializeAndRender([]);
		if($location.hash()) {
			var loc = $location.hash();
			if(loc[0]=='@') {
				$scope.deserializeAndRender(URLON.parse(encodeURI(loc)));
			} else {
				$scope.deserializeAndRender($serial.fromJsonL(loc));
			}
		} else if($location.path()[0] === '/' && $location.path().length > 1) {
			loadAndRender($location.path());
		} else {
			// Some simple default content... just a numpad
			$scope.deserializeAndRender([
				["Num Lock","/","*","-",
					{x:0.25,f:4,w:14,h:5,d:true},"<h5><b>Getting Started with Keyboard-Layout-Editor.com</b></h5>"+
					"<p>Keyboard-layout-editor.com is a web application that enables the editing of keyboard-layouts, i.e., the position and appearance of each physical key.</p>"+
					"<p>Start by exploring the presets and samples from the menu-bar to give you an idea of the possibilities.  Once you are ready to start designing your own keyboard, just load one of the presets and start customizing it!  Some tips:</p>"+
					"<ul><li>The selected keys can be modified on the <i>Properties</i> tab.</li>"+
					"<li>The <i>Keyboard Properties</i> tab lets you edit the keyboard background and keyboard metadata.</li>"+
					"<li>The <i>Custom Styles</i> tab lets you write advanced CSS styling rules.</li>"+
					"<li>Don't forget the <i>Color Swatches</i> and <i>Character Picker</i> menu items!  These give you easy access to colors and symbol characters, respectively.</li>"+
					"<li>There are a lot of available keyboard shortcuts; press '?' or 'F1' to see a list.</li></ul>"+
					"<p>When you're ready to save your layout, simply 'Sign In' with your <a href='https://www.github.com'>GitHub</a> account and click the <i>Save</i> button.  Your layout will be saved in a GitHub Gist.</p>"+
					"<p>Have fun!</p>"],
				[{f:3},"7\nHome","8\n↑","9\nPgUp",{h:2},"+"],
				["4\n←","5","6\n→"],
				["1\nEnd","2\n↓","3\nPgDn",{h:2},"Enter"],
				[{w:2},"0\nIns",".\nDel"]
			]);
		}

		// Undo/redo support
		var undoStack = [];
		var redoStack = [];
		var canCoalesce = false;
		$scope.canUndo = function() { return undoStack.length>0; };
		$scope.canRedo = function() { return redoStack.length>0; };
		$scope.dirty = false;
		$scope.saved = false;
		$scope.saveError = "";
		var dirtyMessage = 'You have made changes to the layout that are not saved.  You can save your layout to the server by clicking the \'Save\' button.  You can also save your layout locally by bookmarking the \'Permalink\' in the application bar.';
		window.onbeforeunload = function(e) {
			if($scope.dirty) return dirtyMessage;
		};
		function confirmNavigate() {
			if(!$scope.dirty) {
				var deferred = $q.defer();
				deferred.resolve();
				return deferred.promise;
			}
			return $confirm.show(dirtyMessage + "\n\nAre you sure you want to navigate away?");
		}
		function resetUndoStack() {
			undoStack = [];
			redoStack = [];
			canCoalesce = false;
			$scope.dirty = false;
			$scope.saved = false;
			$scope.saveError = "";
		}

		function transaction(type, fn) {
			var trans = undoStack.length>0 ? undoStack.last() : null;
			if(trans === null || !canCoalesce || trans.type !== type) {
				trans = { type:type, original:angular.copy($scope.keyboard), open:true, dirty:$scope.dirty };
				undoStack.push(trans);
				if(undoStack.length>32) {
					undoStack.shift();
				}
			}
			canCoalesce = true;
			try {
				fn();
			} finally {
				if(!$scope.currentGist) {
					$location.path("").hash("").replace();
				}
				trans.modified = angular.copy($scope.keyboard);
				trans.open = false;
				redoStack = [];
				if(type !== 'rawdata') {
					updateSerialized();
				}
				$scope.dirty = true;
				$scope.saved = false;
				$scope.saveError = "";
				$scope.loadError = false;
			}
		}

		function refreshAfterUndoRedo(type) {
			updateSerialized();
			$scope.keys().forEach(function(key) {
				renderKey(key);
			});
			$scope.unselectAll();
			$scope.meta = angular.copy($scope.keyboard.meta);
			if(type === 'customstyles' || type === 'preset' || type === 'upload' || type === 'rawdata') {
				updateFromCss($scope.meta.css || '');
			}
		}

		$scope.undo = function() {
			if($scope.canUndo()) {
				var u = undoStack.pop();
				$scope.keyboard = angular.copy(u.original);
				refreshAfterUndoRedo(u.type);
				redoStack.push(u);
				$scope.dirty = u.dirty;
			}
		};

		$scope.redo = function() {
			if($scope.canRedo()) {
				var u = redoStack.pop();
				$scope.keyboard = angular.copy(u.modified);
				refreshAfterUndoRedo(u.type);
				undoStack.push(u);
				$scope.dirty = true;
			}
		};

		// Validate a key's property values
		function validate(key,prop,value) {
			var v = {
				_ : function() { return value; },
				x : function() { return Math.max(0, Math.min(36, value)); },
				y : function() { return Math.max(0, Math.min(36, value)); },
				x2 : function() { return Math.max(-Math.abs(key.width-key.width2), Math.min(Math.abs(key.width-key.width2), value)); },
				y2 : function() { return Math.max(-Math.abs(key.height-key.height2), Math.min(Math.abs(key.height-key.height2), value)); },
				width : function() { return Math.max(0.5, Math.min(24, value)); },
				height : function() { return Math.max(0.5, Math.min(24, value)); },
				width2 : function() { return Math.max(0.5, Math.min(24, value)); },
				height2 : function() { return Math.max(0.5, Math.min(24, value)); },
				textSize : function() { return Math.max(1, Math.min(9, value)); },
				rotation_angle : function() { return Math.max(-180, Math.min(180, value)); },
				rotation_x : function() { return Math.max(0, Math.min(36, value)); },
				rotation_y : function() { return Math.max(0, Math.min(36, value)); },
				"meta.radii" : function() { var ndx = value.indexOf(';'); return ndx>=0 ? value.substring(0,ndx) : value; }
			};
			return (v[prop] || v._)();
		}

		function update(key,prop,value,index) {
			var u = {
				_ : function() { key[prop] = value; },
				width : function() { key.width = value; if(!key.stepped || key.width > key.width2) key.width2 = value; },
				height : function() { key.height = value; if(!key.stepped || key.height > key.height2) key.height2 = value; },
				textColor : function() { if(index<0) { key.default.textColor = value; key.textColor = []; } else { key.textColor[index] = value; } },
				textSize : function() { if(index<0) { key.default.textSize = value; key.textSize = []; } else { key.textSize[index] = value; } },
				labels : function() { key.labels[index] = value; },
				stepped : function() {
					if(!key.decal) {
						key[prop] = value;
						if(value && key.width === key.width2) {
							if(key.width > 1) {
								key.width = Math.max(1, key.width-0.5);
							} else {
								key.width2 = key.width+0.5;
							}
						}
					}
				},
				nub : function() { if(!key.decal) key[prop] = value; },
				ghost : function() { if(!key.decal) key[prop] = value; },
				decal : function() { key[prop] = value; key.x2 = key.y2 = 0; key.width2 = key.width; key.height2 = key.height; key.nub = key.stepped = key.ghost = false; },
				rotation_angle : function() { key.rotation_angle = value; key.rotation_x = $scope.multi.rotation_x; key.rotation_y = $scope.multi.rotation_y; },
				sm : function() { if(value===$scope.meta.switchMount) value=''; if(value != key.sm) { key.sm = value; key.sb = key.st = ''; } },
				sb : function() { if(value===$scope.meta.switchBrand) value=''; if(value != key.sb) { key.sb = value; key.st = ''; } },
				st : function() { if(value===$scope.meta.switchType) value=''; if(value != key.st) { key.st = value; } },
			};
			return (u[prop] || u._)();
		}

		$scope.updateMulti = function(prop, index) {
			if($scope.multi[prop] == null || $scope.selectedKeys.length <= 0) {
				return;
			}
			var value = index < 0 ? $scope.multi.default[prop] : (index !== undefined ? $scope.multi[prop][index] : $scope.multi[prop]);
			var valid = validate($scope.multi, prop, value);
			if(valid !== value) {
				return;
			}

			transaction("update", function() {
				$scope.selectedKeys.forEach(function(selectedKey) {
					update(selectedKey, prop, value, index);
					renderKey(selectedKey);
				});
				$scope.multi = angular.copy($scope.selectedKeys.last());
			});
		};
		$scope.setMulti = function(prop, value) {
			$scope.multi[prop] = value;
			$scope.updateMulti(prop);
		};

		$scope.validateMulti = function(prop, index) {
			if($scope.multi[prop] == null) {
				$scope.multi[prop] = "";
			}
			var value = index < 0 ? $scope.multi.default[prop] : (index !== undefined ? $scope.multi[prop][index] : $scope.multi[prop]);
			var valid = validate($scope.multi, prop, value);
			if(valid !== value) {
				if(index < 0)
					$scope.multi.default[prop] = valid;
				else if(index !== undefined)
					$scope.multi[prop][index] = valid;
				else
					$scope.multi[prop] = valid;
				$scope.updateMulti(prop, index);
			}
		};

		$scope.updateMeta = function(prop) {
			var value = $scope.meta[prop];
			var valid = validate($scope.meta, "meta."+prop, value);
			if(valid !== value) {
				return;
			}
			transaction("metadata", function() {
				$scope.keyboard.meta[prop] = value;
				if(prop==='switchMount') { $scope.keyboard.meta.switchBrand = $scope.keyboard.meta.switchType = ''; }
				else if(prop==='switchBrand') { $scope.keyboard.meta.switchType = ''; }
			});
			$scope.meta = angular.copy($scope.keyboard.meta);
			$scope.calcKbHeight();
		};
		$scope.validateMeta = function(prop) {
			var value = $scope.meta[prop];
			var valid = validate($scope.meta, "meta."+prop, value);
			if(valid !== value) {
				$scope.meta[prop] = valid;
				$scope.updateMeta(prop);
			}
		};
		$scope.setBackground = function(bg) {
			$scope.meta.background = bg;
			$scope.updateMeta('background');
		};

		updateSerialized();

		$scope.swapSizes = function() {
			transaction("swapSizes", function() {
				$scope.selectedKeys.forEach(function(selectedKey) {
					var temp;
					temp = selectedKey.width; selectedKey.width = selectedKey.width2; selectedKey.width2 = temp;
					temp = selectedKey.height; selectedKey.height = selectedKey.height2; selectedKey.height2 = temp;
					selectedKey.x += selectedKey.x2;
					selectedKey.y += selectedKey.y2;
					selectedKey.x2 = -selectedKey.x2;
					selectedKey.y2 = -selectedKey.y2;
					renderKey(selectedKey);
				});
				$scope.multi = angular.copy($scope.selectedKeys.last());
			});
		};

		$scope.swapColors = function() {
			transaction("swapColors", function() {
				$scope.selectedKeys.forEach(function(selectedKey) {
					var temp = selectedKey.color;
					selectedKey.color = selectedKey.default.textColor;
					selectedKey.default.textColor = temp;
					selectedKey.textColor = [];
					renderKey(selectedKey);
				});
				$scope.multi = angular.copy($scope.selectedKeys.last());
			});
		};

		$scope.pickerSelect = function(glyph) {
			$scope.pickerSelection = glyph;
		};
		$scope.dropGlyph = function(glyph,$event,textIndex) {
			$event.preventDefault();
			$event.stopPropagation();
			if($scope.selectedKeys.length<1) {
				return;
			}
			transaction("character-picker", function() {
				$scope.selectedKeys.forEach(function(selectedKey) {
					selectedKey.labels[textIndex] = glyph.html;
					renderKey(selectedKey);
				});
				$scope.multi = angular.copy($scope.selectedKeys.last());
			});
		};

		$scope.clickSwatch = function(color,$event) {
			$scope.dropSwatch(color,$event,$event.ctrlKey || $event.altKey,-1);
		};
		$scope.dropSwatch = function(color,$event,isText,textIndex) {
			$event.preventDefault();
			$event.stopPropagation();
			if($scope.selectedKeys.length<1) {
				return;
			}
			transaction("color-swatch", function() {
				$scope.selectedKeys.forEach(function(selectedKey) {
					if(isText) {
						if(textIndex<0) {
							selectedKey.default.textColor = color.css;
							selectedKey.textColor = [];
						}	else {
							selectedKey.textColor[textIndex] = color.css;
						}
					} else {
						selectedKey.color = color.css;
					}
					renderKey(selectedKey);
				});
				$scope.multi = angular.copy($scope.selectedKeys.last());
			});
		};

		$scope.makePaletteFromKeys = function(event) {
			if(event) {
				event.preventDefault();
			}
			var unselect = false;
			if($scope.selectedKeys.length<1) {
				$scope.selectAll();
				unselect = true;
			}

			var colors = {};
			// Get the unique colors of selected keys.
			$scope.selectedKeys.forEach(function(selectedKey) {
				colors[selectedKey.color] = null;
				colors[selectedKey.text] = null;
			});

			// Build palette.
			var p = {
				"name": "Custom palette",
				"description": "This is a custom palette generated from existing colors in the keyboard layout.",
				"href": $scope.getPermalink(),
				"colors": []
			};

			// Build colors.
			for (var prop in colors) {
				if (colors.hasOwnProperty(prop) && prop[0] == '#') {
					var color = null;
					// Look for the color in the current palette, and use it if found,
					// in order to keep the name.
					if($scope.palette && $scope.palette.colors) {
						for (var i = 0, len = $scope.palette.colors.length; i < len; ++i) {
							if ($scope.palette.colors[i].css == prop) {
								color = $scope.palette.colors[i];
								break;
							}
						}
					}
					if(color == null) {
						// Make a new color.
						color = $color.sRGB8(parseInt(prop.slice(1,3), 16),
						                     parseInt(prop.slice(3,5), 16),
						                     parseInt(prop.slice(5,7), 16));
						color.css = color.hex();
						color.name = color.css;
					}
					if(color) {
						p.colors.push(color);
					}
				}
			}
			p.colors.sort(function(a, b) { return a.name.localeCompare(b.name); });
			$scope.loadPalette(p);

			if (unselect) {
				$scope.unselectAll();
			}
		}

		$scope.moveKeys = function(x,y,$event) {
			$event.preventDefault();
			$event.stopPropagation();
			if($scope.selectedKeys.length<1) {
				return;
			}

			if(x<0 || y<0) {
				var canMoveKeys = true;
				$scope.selectedKeys.forEach(function(selectedKey) {
					if(selectedKey.x + x < 0 ||
					   selectedKey.y + y < 0 ||
					   selectedKey.x + selectedKey.x2 + x < 0 ||
					   selectedKey.y + selectedKey.y2 + y < 0) {
						canMoveKeys = false;
					}
				});
				if(!canMoveKeys) {
					return;
				}
			}

			transaction("move", function() {
				$scope.selectedKeys.forEach(function(selectedKey) {
					selectedKey.x = Math.round10(Math.max(0,selectedKey.x + x),-2);
					selectedKey.y = Math.round10(Math.max(0,selectedKey.y + y),-2);
					renderKey(selectedKey);
				});
				$scope.multi = angular.copy($scope.selectedKeys.last());
			});
			if(y !== 0) { $scope.calcKbHeight(); }
		};

		$scope.sizeKeys = function(x,y,$event) {
			$event.preventDefault();
			$event.stopPropagation();
			if($scope.selectedKeys.length<1) {
				return;
			}
			transaction("size", function() {
				$scope.selectedKeys.forEach(function(selectedKey) {
					update(selectedKey, 'width', validate(selectedKey, 'width', Math.round10(Math.max(1,selectedKey.width + x),-2)));
					update(selectedKey, 'height', validate(selectedKey, 'height', Math.round10(Math.max(1,selectedKey.height + y),-2)));
					renderKey(selectedKey);
				});
				$scope.multi = angular.copy($scope.selectedKeys.last());
			});
			if(y!==0) { $scope.calcKbHeight(); }
		};

		$scope.rotateKeys = function(angle,$event) {
			$event.preventDefault();
			$event.stopPropagation();
			if($scope.selectedKeys.length<1) {
				return;
			}
			transaction("rotate", function() {
				$scope.selectedKeys.forEach(function(selectedKey) {
					var newangle = (selectedKey.rotation_angle+angle+360)%360;
					while(newangle > 180) { newangle -= 360; }
					update(selectedKey, 'rotation_angle', Math.round(newangle));
					renderKey(selectedKey);
				});
				$scope.multi = angular.copy($scope.selectedKeys.last());
			});
			$scope.calcKbHeight();
		};
		$scope.moveCenterKeys = function(x,y,$event) {
			$event.preventDefault();
			$event.stopPropagation();
			if($scope.selectedKeys.length<1) {
				return;
			}
			transaction("moveCenter", function() {
				$scope.selectedKeys.forEach(function(selectedKey) {
					update(selectedKey, 'rotation_x', validate(selectedKey, 'rotation_x', Math.round10($scope.multi.rotation_x + x,-2)));
					update(selectedKey, 'rotation_y', validate(selectedKey, 'rotation_y', Math.round10($scope.multi.rotation_y + y,-2)));
					renderKey(selectedKey);
				});
				$scope.multi = angular.copy($scope.selectedKeys.last());
			});
			$scope.calcKbHeight();
		};

		var userGlyphsSentinel = {};
		$scope.loadCharacterPicker = function(picker) {
			$scope.picker = picker || {
				name: "User-Defined Glyphs",
				glyphs: $scope.customGlyphs,
				href: "https://github.com/ijprest/keyboard-layout-editor/wiki/Custom-Styles",
				description: "This list will show any glyphs defined in your layout's 'Custom Styles' tab.  See the Commodore VIC-20 sample layout for an example.",
				sentinel: userGlyphsSentinel
			};
			$scope.palette = {}; // turn off the palette
			$scope.pickerFilter = '';
			$scope.pickerSelection = {};

			// Load the CSS if necessary
			if($scope.picker.css && !$scope.picker.glyphs) {
				$http.get($scope.picker.css).success(function(css) {
					$scope.picker.glyphs = $renderKey.getGlyphsFromRules($cssParser.parse(css));
				});
			}
		};

		$scope.loadPalette = function(p) {
			$scope.palette = p;
			$scope.picker = {}; // turn off the character picker
		};
		$scope.colorName = function(color) {
			if(color && $scope.palette.colors) {
				for (var i = 0; i < $scope.palette.colors.length; i++) {
					if($scope.palette.colors[i].css === color) {
						return $scope.palette.colors[i].name;
					}
				}
			}
			return "";
		};

		$scope.loadPreset = function(preset, path) {
			confirmNavigate().then(function() {
				transaction("preset", function() {
					$scope.deserializeAndRender(preset);
				});
				setGist(null);
				resetUndoStack();
				$location.path(path || "").hash("").replace();
				$scope.dirty = false;
			});
		};
		$scope.loadSample = function(sample) {
			$http.get(sample).success(function(data) {
				$scope.loadPreset(data, sample);
			}).error(function() {
				$scope.loadError = true;
			});
		};

		$scope.deleteKeys = function() {
			if($scope.selectedKeys<1)
				return;

			transaction('delete', function() {
				// Sort the keys, so we can easily select the next key after deletion
				$serial.sortKeys($scope.keys());

				// Get the indicies of all the selected keys
				var toDelete = $scope.selectedKeys.map(function(key) { return $scope.keys().indexOf(key); });
				toDelete.sort(function(a,b) { return parseInt(a) - parseInt(b); });

				// Figure out which key we're going to select after deletion
				var toSelectNdx = toDelete.last()+1;
				var toSelect = $scope.keys()[toSelectNdx];

				// Delete the keys in reverse order so that the indicies remain valid
				for(var i = toDelete.length-1; i >= 0; --i) {
					$scope.keys().splice(toDelete[i],1);
				}

				// Select the next key
				var ndx = $scope.keys().indexOf(toSelect);
				if(ndx < 0) { ndx = toDelete[0]-1; }
				if(ndx < 0) { ndx = 0; }
				toSelect = $scope.keys()[ndx];
				if(toSelect) {
					$scope.selectedKeys = [toSelect];
					$scope.multi = angular.copy(toSelect);
				} else {
					$scope.unselectAll();
				}
			});
			$('#keyboard').focus();
		};

		function whereToAddNewKeys(nextline) {
			var xpos = 0, ypos = -1;
			$serial.sortKeys($scope.keys());
			if(!nextline && $scope.selectedKeys.length>0 && $scope.keys().length>0 && $scope.multi.x == $scope.keys().last().x) {
				xpos = $scope.multi.x + Math.max($scope.multi.width, $scope.multi.width2 || 0);
				ypos = $scope.multi.y;
				if(xpos >= 23) { xpos = 0; ypos++; }
			} else {
				$scope.keys().forEach(function(key) {
					if(!$scope.selectedKeys.length || (key.rotation_angle == $scope.multi.rotation_angle && key.rotation_x == $scope.multi.rotation_x && key.rotation_y == $scope.multi.rotation_y)) {
						ypos = Math.max(ypos,key.y);
					}
				});
				ypos++;
			}
			return {x:xpos, y:ypos};
		}

		$scope.addKey = function(proto, nextline) {
			var newKey = null;
			transaction("add", function() {
				var pos = whereToAddNewKeys(nextline);
				var _addKey = function(proto) {
					newKey = $serial.defaultKeyProps();
					if($scope.selectedKeys.length>0) {
						newKey.color = $scope.multi.color;
						newKey.textColor = $scope.multi.textColor;
						newKey.profile = $scope.multi.profile;
						newKey.rotation_angle = $scope.multi.rotation_angle;
						newKey.rotation_x = $scope.multi.rotation_x;
						newKey.rotation_y = $scope.multi.rotation_y;
					}
					$.extend(newKey, proto);
					newKey.x += pos.x;
					newKey.y += pos.y;
					renderKey(newKey);
					pos.x += Math.max(newKey.width, newKey.width2);
					$scope.keys().push(newKey);
				}
				if(proto instanceof Array) {
					proto.forEach(_addKey);
				} else {
					_addKey(proto);
				}
			});
			selectKey(newKey,{});
			$scope.calcKbHeight();
			$('#keyboard').focus();
		};

		$scope.addKeys = function(count) {
			var i;
			for(i = 0; i < count; ++i) {
				$scope.addKey();
			}
		};

		$scope.deserializeException = "";
		$scope.updateFromSerialized = function() {
			if(serializedTimer) {
				$timeout.cancel(serializedTimer);
			}
			serializedTimer = $timeout(function() {
				try {
					$scope.deserializeException = "";
					transaction("rawdata", function() {
						$scope.deserializeAndRender(fromJsonPretty($scope.serialized), true);
					});
					$scope.unselectAll();
				} catch(e) {
					$scope.deserializeException = e.toString();
				}
			}, 1000);
		};

		$scope.updateCustomStyles = function() {
			if(customStylesTimer) {
				$timeout.cancel(customStylesTimer);
			}
			customStylesTimer = $timeout(function() {
				try {
					$scope.customStylesException = "";
					transaction("customstyles", function() {
						updateFromCss($scope.meta.css);
						$scope.keyboard.meta.css = $scope.meta.css;
					});
					$scope.calcKbHeight();
				} catch(e) {
					$scope.customStylesException = e.toString();
				}
			}, 1000);
		};

		$scope.selRect = { display:"none" };

		// Called when the mouse is clicked within #keyboard; we use this to initiate a marquee
		// selection action.
		var doingMarqueeSelect = false;
		$scope.selectClick = function(event) {
			var kbElem = $("#keyboard");
			$scope.selRect = { display:"none", x:event.pageX, y:event.pageY, l:event.pageX, t:event.pageY, w:0, h:0 };
			$scope.selRect.kb = { 	left: kbElem.position().left + parseInt(kbElem.css('margin-left'),10),
									top: kbElem.position().top + parseInt(kbElem.css('margin-top'),10),
									width: kbElem.outerWidth(),
									height:kbElem.outerHeight()
								};
			doingMarqueeSelect = true;
			event.preventDefault();
			event.stopPropagation();
		};

		// Called whenever the mouse moves over the document; ideally we'd get mouse-capture on
		// mouse-down over #keyboard, but it doesn't look like there's a real way to do that in
		// JS/HTML, so we do our best to simulate it.  Also, there doesn't appear to be any way
		// to recover if the user releases the mouse-button outside of the browser window.
		$scope.selectMove = function(event) {
			if(doingMarqueeSelect) {
				// Restrict the mouse position to the bounds #keyboard
				var pageX = Math.min($scope.selRect.kb.left + $scope.selRect.kb.width, Math.max($scope.selRect.kb.left, event.pageX));
				var pageY = Math.min($scope.selRect.kb.top + $scope.selRect.kb.height, Math.max($scope.selRect.kb.top, event.pageY));

				// Calculate the new marquee rectangle (normalized)
				if(pageX < $scope.selRect.x) {
					$scope.selRect.l = pageX;
					$scope.selRect.w = $scope.selRect.x - pageX;
				} else {
					$scope.selRect.l = $scope.selRect.x;
					$scope.selRect.w = pageX - $scope.selRect.x;
				}
				if(pageY < $scope.selRect.y) {
					$scope.selRect.t = pageY;
					$scope.selRect.h = $scope.selRect.y - pageY;
				} else {
					$scope.selRect.t = $scope.selRect.y;
					$scope.selRect.h = pageY - $scope.selRect.y;
				}

				// If the mouse has moved more than our threshold, then display the marquee
				if($scope.selRect.w + $scope.selRect.h > 5) {
					$scope.selRect.display = "inherit";
				}
			}
		};

		// Called when the mouse button is released anywhere over the document; see notes above
		// about mouse-capture.
		$scope.selectRelease = function(event) {
			if(doingMarqueeSelect) {
				$serial.sortKeys($scope.keys());
				doingMarqueeSelect = false;

				// Calculate the offset between #keyboard and the mouse-coordinates
				var kbElem = $("#keyboard-bg");
				var kbPos = kbElem.position();
				var offsetx = kbPos.left + parseInt(kbElem.css('padding-left'),10) + parseInt(kbElem.css('margin-left'),10);
				var offsety = kbPos.top + parseInt(kbElem.css('padding-top'),10) + parseInt(kbElem.css('margin-top'),10);

				// Check to see if the marquee was actually displayed
				if($scope.selRect.display !== "none") {
					// Clear the array of selected keys if the CTRL isn't held down.
					if(!event.ctrlKey && !event.altKey) {
						$scope.unselectAll();
					}

					$scope.selRect.display = "none";

					// Adjust the mouse coordinates to client coordinates
					$scope.selRect.l -= offsetx;
					$scope.selRect.t -= offsety;

					// Iterate over all the keys
					$scope.keys().forEach(function(key) {
						// Check to see if the key is *entirely within* the marquee rectangle
						if( key.bbox.x >= $scope.selRect.l && key.bbox.x+key.bbox.w <= $scope.selRect.l+$scope.selRect.w &&
							key.bbox.y >= $scope.selRect.t && key.bbox.y+key.bbox.h <= $scope.selRect.t+$scope.selRect.h )
						{
							// Key is inside the rectangle; select it (if not already selected).
							if($scope.selectedKeys.indexOf(key) < 0) {
								selectKey(key, {ctrlKey:true});
							}
						}
					});
				} else {
					// Clear the array of selected keys if the CTRL isn't held down.
					if(!event.ctrlKey && !event.altKey && !event.shiftKey) {
						$scope.unselectAll();
					}

					// The marquee wasn't displayed, so we're doing a single-key selection;
					// iterate over all the keys.
					$scope.keys().forEach(function(key) {
						// Rotate the mouse coordinates into transformed key-space, if necessary
						var pt = { x:event.pageX-offsetx, y:event.pageY-offsety };
						if(key.rotation_angle) {
							pt = key.mat.transformPt(pt);
						}

						// Just check to see if the mouse click is within any key rectangle
						if( (key.rect.x <= pt.x && key.rect.x+key.rect.w >= pt.x &&
							 key.rect.y <= pt.y && key.rect.y+key.rect.h >= pt.y) ||
							(key.rect2.x <= pt.x && key.rect2.x+key.rect2.w >= pt.x &&
							 key.rect2.y <= pt.y && key.rect2.y+key.rect2.h >= pt.y) )
						{
							selectKey(key, {ctrlKey:event.ctrlKey, altKey:event.altKey, shiftKey:event.shiftKey});
						}
					});
				}
				canCoalesce = false;

				event.preventDefault();
				event.stopPropagation();

				// Focus the keyboard, so keystrokes have the desired effect
				$('#keyboard').focus();
			}
		};

		$scope.getPermalink = function() {
			var url = $location.absUrl().replace(/#.*$/,"");
			url += "##" + URLON.stringify($scope.serializedObjects);
			return url;
		};

		// Called on 'j' or 'k' keystrokes; navigates to the next or previous key
		$scope.prevKey = function(event) {
			if($scope.keys().length>0) {
				$serial.sortKeys($scope.keys());
				var ndx = ($scope.selectedKeys.length>0) ? Math.max(0,$scope.keys().indexOf($scope.selectedKeys.last())-1) : 0;
				var selndx = $scope.selectedKeys.indexOf($scope.keys()[ndx]);
				if(event.shiftKey && $scope.keys().length>1 && $scope.selectedKeys.length>0 && selndx>=0) {
					$scope.selectedKeys.pop(); //deselect the existing cursor
					$scope.selectedKeys.splice(selndx,1); //make sure the new cursor is at the end of the selection list
				}
				selectKey($scope.keys()[ndx], {ctrlKey:event.shiftKey});
				canCoalesce = false;
			}
		};
		$scope.nextKey = function(event) {
			if($scope.keys().length>0) {
				$serial.sortKeys($scope.keys());
				var ndx = ($scope.selectedKeys.length>0) ? Math.min($scope.keys().length-1,$scope.keys().indexOf($scope.selectedKeys.last())+1) : $scope.keys().length-1;
				var selndx = $scope.selectedKeys.indexOf($scope.keys()[ndx]);
				if(event.shiftKey && $scope.keys().length>1 && $scope.selectedKeys.length>0 && selndx>=0) {
					$scope.selectedKeys.pop(); //deselect the existing cursor
					$scope.selectedKeys.splice(selndx,1); //make sure the new cursor is at the end of the selection list
				}
				selectKey($scope.keys()[ndx], {ctrlKey:event.shiftKey});
				canCoalesce = false;
			}
		};

		$scope.focusKb = function() { $('#keyboard').focus(); };
		$scope.focusEditor = function() {
			if($scope.selectedKeys.length > 0) {
				if($scope.selTab !== 0) {
					$scope.selTab = 0;
					$('#properties').removeClass('hidden');
				}
				$('#labeleditor0').focus().select();
			} else {
				if($scope.selTab !== 1) {
					$scope.selTab = 1;
					$('#kbdproperties').removeClass('hidden');
				}
				$('#kbdcoloreditor').focus().select();
			}
		};

		var activeModal = null;
		$scope.showMarkdown = function(filename, event) {
			if($scope.markdownTitle !== filename) {
				$scope.markdownTitle = filename;
				$scope.markdownContent = '';
				$http.get(filename).success(function(data) {
					$scope.markdownContent = $sce.trustAsHtml(marked(data));
				});
			}
			if(activeModal) activeModal.close();
			activeModal = $modal.open({
				templateUrl:"markdownDialog.html",
				controller:"modalCtrl",
				scope:$scope,
				windowClass:"modal-xxl markdownDialog",
				resolve: { params: function() { return { parentScope: $scope }; } }
			});
			if(event) {
				event.preventDefault();
				event.stopPropagation();
			}
		};
		$scope.previewNotes = function(event) {
			$scope.markdownTitle = 'About This Keyboard Layout';
			var name = $scope.keyboard.meta.name;
			var author = $scope.keyboard.meta.author;
			var notes = $scope.keyboard.meta.notes;
			var markdown = (name ? ("### " + name + "\n") : "") +
			               (author ? ("#### _" + author + "_\n") : "") +
			               (notes ? (notes) : "");
			$scope.markdownContent = $sce.trustAsHtml($sanitize(marked(markdown)));
			$scope.showMarkdown($scope.markdownTitle, event);
		};

		$scope.showHelp = function(event) {
			if(!document.activeElement || (document.activeElement.nodeName !== "INPUT" && document.activeElement.nodeName !== "TEXTAREA")) {
				if(activeModal) activeModal.dismiss('cancel');
				activeModal = $modal.open({
					templateUrl:"helpDialog.html",
					controller:"modalCtrl",
					scope:$scope,
					windowClass:"modal-xl",
					resolve: { params: null }
				});
				event.preventDefault();
				event.stopPropagation();
			}
		};

		$scope.showOptions = function(event) {
			if(activeModal) activeModal.dismiss('cancel');
			activeModal = $modal.open({
				templateUrl:"optionsDialog.html",
				controller:"modalCtrl",
				scope:$scope,
				resolve: { params: function() { return { moveStep:$scope.moveStep, sizeStep:$scope.sizeStep, rotateStep:$scope.rotateStep }; } }
			});
			activeModal.result.then(function(params) { $.extend($scope, params); });
			if(event) {
				event.preventDefault();
				event.stopPropagation();
			}
		};

		// Clipboard functions
		var clipboard = {};
		$scope.cut = function(event) {
			if(event) {
				event.preventDefault();
				event.stopPropagation();
			}
			if($scope.selectedKeys.length>0) {
				clipboard = angular.copy($scope.selectedKeys);
				$scope.deleteKeys();
			}
		};
		$scope.copy = function(event) {
			if(event) {
				event.preventDefault();
				event.stopPropagation();
			}
			if($scope.selectedKeys.length>0) {
				clipboard = angular.copy($scope.selectedKeys);
			}
		};
		$scope.paste = function(event) {
			if(event) {
				event.preventDefault();
				event.stopPropagation();
			}
			if(clipboard.length<1) {
				return;
			}
			$serial.sortKeys(clipboard);

			// Copy the clipboard keys, and adjust them all relative to the first key
			var clipCopy = angular.copy(clipboard);
			var minx = 0, miny = 0, singleRow = true;
			clipCopy.forEach(function(key) {
				minx = Math.min(minx, key.x -= clipboard[0].x);
				miny = Math.min(miny, key.y -= clipboard[0].y);
			});

			// Adjust to make sure nothing < 0
			clipCopy.forEach(function(key) {
				key.x -= minx;
				key.y -= miny;
				if(key.y>0) { singleRow = false; }
			});

			// Figure out where to put the keys
			var pos = whereToAddNewKeys(!singleRow);

			// Perform the transaction
			transaction("paste", function() {
				clipCopy.forEach(function(key,i) {
					key.x += pos.x;
					key.y += pos.y;
					renderKey(key);
					$scope.keys().push(key);
					$scope.selectedKeys = clipCopy;
					$scope.multi = angular.copy($scope.selectedKeys.last());
				});
			});
		};
		$scope.canCopy = function() { return $scope.selectedKeys.length > 0; };
		$scope.canPaste = function() { return clipboard.length > 0; };

		$scope.keyboardTop = function() { var kbElem = $("#keyboard"); return kbElem.position().top + parseInt(kbElem.css('margin-top'),10); };
		$scope.keyboardLeft = function() { var kbElem = $("#keyboard"); return kbElem.position().left + parseInt(kbElem.css('margin-left'),10); };

		function updateUserInfo() {
			if($cookies.oauthToken) {
				$scope.user = { id: '', name: "User", avatar: "<i class='fa fa-user'></i>" };
				github('/user').success(function(data) {
					$scope.user.id = data.login;
					$scope.user.name = data.login;
					if(data.avatar_url) {
						$scope.user.avatar = "<img src='"+data.avatar_url+"' class='avatar'>";
					}
				});
			} else {
				$scope.user = null;
			}
		}
		updateUserInfo();

		var userLoginSecret;
		var userLoginWindow;
		$scope.userLogin = function() {
			if(userLoginWindow) {
				if(userLoginWindow.closed) {
					userLoginSecret = null;
					userLoginWindow = null;
				} else {
					userLoginWindow.focus();
				}
			}

			if(!userLoginWindow && !$scope.user) {
				var parms = "&client_id="+ $scope.githubClientId +"&redirect_uri="+ ($location.host() === "localhost" ? "http://localhost:8080/oauth.html" : "https://readf0x.github.io/keyboard-layout-editor/oauth.html");
				userLoginSecret = (window.performance && window.performance.now ? window.performance.now() : Date.now()).toString() + "_" + (Math.random()).toString();
				userLoginWindow = window.open("https://github.com/login/oauth/authorize?scope=gist&state="+userLoginSecret+parms,
					"Sign in with Github", "left="+(window.left+50)+",top="+(window.top+50)+",width=1050,height=630,personalbar=0,toolbar=0,scrollbars=1,resizable=1");
				if(userLoginWindow) {
					userLoginWindow.focus();
				}
			}
		};

		$scope.userLogout = function() {
			$cookies.oauthToken = "";
			updateUserInfo();
		};

		$scope.oauthError = null;
		window.__oauthError = function(error) {
			userLoginSecret = null;
			userLoginWindow = null;
			$scope.oauthError = error || 'Unknown error.';
			$scope.oauthToken = "";
			updateUserInfo();
		};

		window.__oauthSuccess = function(code, secret) {
			if(secret !== userLoginSecret) {
				window.__oauthError('The server returned an incorrect login secret.');
			} else {
				userLoginSecret = null;
				userLoginWindow = null;
				$cookies.oauthToken = code;
				updateUserInfo();
			}
		};

		$scope.showSavedLayouts = function(starred) {
			if(activeModal) activeModal.dismiss('cancel');
			activeModal = $modal.open({
				templateUrl:"savedLayouts.html",
				controller:"savedLayoutsCtrl",
				windowClass:"modal-xl",
				scope:$scope,
				resolve: { params: function() { return { github:github, starred:starred }; } }
			});
			activeModal.result.then(function(params) {
				if(params.load) {
					// Load the selected layout
					confirmNavigate().then(function() {
						var path = "/gists/"+params.load;
						$location.path(path).hash("").replace();
						loadAndRender(path);
						resetUndoStack();
					});
				} else if(params.delete) {
					// Delete the selected layout
					$confirm.show("Are you sure you want to delete this layout?").then(function() {
						github("/gists/"+params.delete, "DELETE").success(function() {
							// If this was the current gist that was deleted, remove it and mark the editor as dirty
							if($scope.currentGist.id == params.delete) {
								$location.path("").hash("").replace();
								setGist(null);
								$scope.dirty = true;
								undoStack.forEach(function(u) {	u.dirty = true;	});
							}
						});
					});
				}
			});
		};

		$scope.aceLoaded = function(editor) {
			editor.$blockScrolling = Infinity;
			editor.getSession().setUseWorker(false);
			editor.setFontSize(14);
			editor.renderer.setVScrollBarAlwaysVisible(true);
		};
	}]);

	// Simple modal-popup controller
	kbApp.controller('modalCtrl', function($scope, $modalInstance, params) {
		$scope.params = params;
		$scope.ok = function() { $modalInstance.close($scope.params); };
		$scope.cancel = function() { $modalInstance.dismiss('cancel'); };
	});

	kbApp.controller('savedLayoutsCtrl', function($scope, $modalInstance, params) {
		$scope.params = params;
		$scope.ok = function() { $modalInstance.close($scope.params); };
		$scope.cancel = function() { $modalInstance.dismiss('cancel'); };
		$scope.load = function(gist) { $scope.params.load = gist;	$scope.ok(); }
		$scope.delete = function(gist) { $scope.params.delete = gist;	$scope.ok(); }

		$scope.layouts = [];
		params.github(params.starred ? "/gists/starred" : "/gists").then(function(response) {
			var index = 0;
			response.data.forEach(function(layout) {
				for(var fn in layout.files) {
					if(fn.indexOf(".kbd.json")>=0) {
						layout.index = ++index;
						$scope.layouts.push(layout);
						break;
					}
				}
			});
		});
	});

	kbApp.directive('kbdColorPicker', function($timeout) {
		return {
			templateUrl: "colorPicker.html",
			restrict: "E",
			scope: { hintText: "@", pickerId: "@", pickerPosition: "@", color: "=ngModel", _onChange: "&ngChange", _onBlur: "&ngBlur", isDisabled: "&ngDisabled" },
			link: function($scope) {
				$scope.onChange = function() { $timeout($scope._onChange); };
				$scope.onBlur = function() { $timeout($scope._onBlur); };
			}
		};
	});

	kbApp.directive('kbdLabelEditor', function() {
		return { templateUrl: "labelEditor.html", restrict: "E", scope: { hintText: "@", labelIndex: "=" } };
	});
	kbApp.directive('kbdMultiCheck', function() {
		return { templateUrl: "multiCheck.html", restrict: "E", scope: { hintText: "@", field: "@", kbdDisable: "=" }, transclude: true };
	});
	kbApp.directive('kbdMultiNumbox', function() {
		return { templateUrl: "multiNumbox.html", restrict: "E", scope: { field: "@", size:"@", min:"@", max:"@", step:"@", kbdDisable: "=" } };
	});

	// Runs a confirmation dialog asynchronously, using promises.
	kbApp.service("$confirm", function($q, $timeout, $window) {
		var current = null;
		return {
			show: function(message) {
				if(current) current.reject();
				current = $q.defer();
				$timeout(function() {
					if($window.confirm(message)) {
						current.resolve();
					} else {
						current.reject();
					}
					current = null;
				}, 0,	false);
				return current.promise;
			}
		}
	});
}());
