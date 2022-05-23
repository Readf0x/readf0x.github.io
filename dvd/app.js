let debug = false;
//try {
const canvas = document.createElement("canvas");
canvas.classList.add("screensaver");
document.body.appendChild(canvas);

const input = document.getElementById('input');
const form = document.getElementById('form');
const button = document.getElementById('button');
const piss = document.getElementById('piss');
const icon = document.getElementById('full-screen-icon');
const style = document.getElementById('full-screen-style');

//var style = document.createElement("style");
//style.innerHTML = `.screensaver {position:fixed;z-index:1000000;width:100%;height:100%;top:0;left:0;}`;
//document.head.appendChild(style);

function getCanvas(){
	if(canvas.width != document.documentElement.clientWidth){canvas.width = document.documentElement.clientWidth;}
	if(canvas.height != document.documentElement.clientHeight){canvas.height = document.documentElement.clientHeight;}
}

let easter = {
	color: 25,
	speed: 2
};
let egg = false;
let keyData;
let keyUp = false;
let eggKeyUp = false;
let updatesSinceKeyUp;
//let maxColor;
let nobounce = false;
let permegg = false;
let cursor = false;
let circle = false;
let sinCount = 0;
let pause = false;
let xgame = false;
window.addEventListener('keypress', (e) => {
	if(e.key=='|'&&document.activeElement.id!='input'){egg=true;}
	if(e.key=='f'&&document.activeElement.id!='input'){openFullscreen();}
	if(debug && e.key=='-'&&document.activeElement.id!='input'){speed*=10;}
	if(debug && e.key=='='&&document.activeElement.id!='input'){speed/=10;}
	if(debug && e.key=='_'&&document.activeElement.id!='input'){if(updateSpeed>0){updateSpeed-=1;}}
	if(debug && e.key=='+'&&document.activeElement.id!='input'){updateSpeed+=1;}
	if(debug && e.key==' '&&document.activeElement.id!='input'){if(pause){pause=false;}else{pause=true;}}
	// if(e.key=='e'&&nobounceChord==7){nobounceChord=0;if(!nobounce){nobounce=true;}else{nobounce=false;}}if(e.key!='e'&&nobounceChord==7){nobounceChord=0;}
	// if(e.key=='c'&&nobounceChord==6){nobounceChord+=1;}if(e.key!='c'&&nobounceChord==6){nobounceChord=0;}
	// if(e.key=='n'&&nobounceChord==5){nobounceChord+=1;}if(e.key!='n'&&nobounceChord==5){nobounceChord=0;}
	// if(e.key=='u'&&nobounceChord==4){nobounceChord+=1;}if(e.key!='u'&&nobounceChord==4){nobounceChord=0;}
	// if(e.key=='o'&&nobounceChord==3){nobounceChord+=1;}if(e.key!='o'&&nobounceChord==3){nobounceChord=0;}
	// if(e.key=='b'&&nobounceChord==2){nobounceChord+=1;}if(e.key!='b'&&nobounceChord==2){nobounceChord=0;}
	// if(e.key=='o'&&nobounceChord==1){nobounceChord+=1;}if(e.key!='o'&&nobounceChord==1){nobounceChord=0;}
	// if(e.key=='n'&&nobounceChord==0){nobounceChord+=1;}if(e.key!='n'&&nobounceChord==0){nobounceChord=0;}
	// if(e.key=='g'&&permeggChord==6){permeggChord=0;if(!permegg){permegg=true;egg=true;}else{permegg=false;egg=false;}}if(e.key!='g'&&permeggChord==6){permeggChord=0;}
	// if(e.key=='g'&&permeggChord==5){permeggChord+=1;}if(e.key!='g'&&permeggChord==5){permeggChord=0;}
	// if(e.key=='e'&&permeggChord==4){permeggChord+=1;}if(e.key!='e'&&permeggChord==4){permeggChord=0;}
	// if(e.key=='m'&&permeggChord==3){permeggChord+=1;}if(e.key!='m'&&permeggChord==3){permeggChord=0;}
	// if(e.key=='r'&&permeggChord==2){permeggChord+=1;}if(e.key!='r'&&permeggChord==2){permeggChord=0;}
	// if(e.key=='e'&&permeggChord==1){permeggChord+=1;}if(e.key!='e'&&permeggChord==1){permeggChord=0;}
	// if(e.key=='p'&&permeggChord==0){permeggChord+=1;}if(e.key!='p'&&permeggChord==0){permeggChord=0;}
	// if(e.key=='r'&&cursorChord==5){cursorChord=0;if(!cursor){cursor=true;canvas.classList.add('hidecursor');}else{cursor=false;canvas.classList.remove('hidecursor');}}if(e.key!='r'&&cursorChord==5){cursorChord=0;}
	// if(e.key=='o'&&cursorChord==4){cursorChord+=1;}if(e.key!='o'&&cursorChord==4){cursorChord=0;}
	// if(e.key=='s'&&cursorChord==3){cursorChord+=1;}if(e.key!='s'&&cursorChord==3){cursorChord=0;}
	// if(e.key=='r'&&cursorChord==2){cursorChord+=1;}if(e.key!='r'&&cursorChord==2){cursorChord=0;}
	// if(e.key=='u'&&cursorChord==1){cursorChord+=1;}if(e.key!='u'&&cursorChord==1){cursorChord=0;}
	// if(e.key=='c'&&cursorChord==0){cursorChord+=1;}if(e.key!='c'&&cursorChord==0){cursorChord=0;}
	// if(e.key=='e'&&circleChord==5){circleChord=0;if(!circle){circle=true;}else{circle=false;}}if(e.key!='e'&&circleChord==5){circleChord=0;}
	// if(e.key=='l'&&circleChord==4){circleChord+=1;}if(e.key!='l'&&circleChord==4){circleChord=0;}
	// if(e.key=='c'&&circleChord==3){circleChord+=1;}if(e.key!='c'&&circleChord==3){circleChord=0;}
	// if(e.key=='r'&&circleChord==2){circleChord+=1;}if(e.key!='r'&&circleChord==2){circleChord=0;}
	// if(e.key=='i'&&circleChord==1){circleChord+=1;}if(e.key!='i'&&circleChord==1){circleChord=0;}
	// if(e.key=='c'&&circleChord==0){circleChord+=1;}if(e.key!='c'&&circleChord==0){circleChord=0;}
	// if(e.key=='g'&&debugChord==4){debugChord=0;if(!debug){debug=true;}else{debug=false;pause=false;}}if(e.key!='g'&&debugChord==4){debugChord=0;}
	// if(e.key=='u'&&debugChord==3){debugChord+=1;}if(e.key!='u'&&debugChord==3){debugChord=0;}
	// if(e.key=='b'&&debugChord==2){debugChord+=1;}if(e.key!='b'&&debugChord==2){debugChord=0;}
	// if(e.key=='e'&&debugChord==1){debugChord+=1;}if(e.key!='e'&&debugChord==1){debugChord=0;}
	// if(e.key=='d'&&debugChord==0){debugChord+=1;}if(e.key!='d'&&debugChord==0){debugChord=0;}
	keyData = e.key;
});
window.addEventListener('keyup', (e) => {
	if(egg||!permegg){
		if(!permegg){egg=false;
		if(dvd.xspeed<0){dvd.xspeed=-1;}else{dvd.xspeed=1;}
		if(dvd.yspeed<0){dvd.yspeed=-1;}else{dvd.yspeed=1;}
		eggKeyUp=true;
		dvd.x = Math.round(dvd.x);
		dvd.y = Math.round(dvd.y);
	}}
	keyUp=true;
	updatesSinceKeyUp=0;
});
let formData;
let evaluated;
form.addEventListener('submit', () => {
	if(input.value=='debug'){if(!debug){debug=true;}else{debug=false;}}
	if(input.value=='nobounce'){if(!nobounce){nobounce=true;}else{nobounce=false;}}
	if(input.value=='permegg'){if(!permegg){permegg=true;egg=true;}else{permegg=false;egg=false;}}
	if(input.value=='cursor'){if(!cursor){cursor=true;canvas.classList.add('hidecursor');}else{cursor=false;canvas.classList.remove('hidecursor');}}
	if(input.value=='circle'){if(!circle){circle=true;}else{circle=false;}}
	if(input.value=='x games mode'){if(!xgame){xgame=true;}else{xgame=false;}}
	formData = input.value;
	var lastChar = input.value.substr(input.value.length - 1);
	try {
		if(lastChar==';'){eval(input.value);}
		else{eval(input.value+';');}
		evaluated=true;
	}
	catch {evaluated=false;}
	input.value = '';
});

let pointerX;
let pointerY;
let updatesSinceMouseMove;
let mouseMove = false;
document.onmousemove = function(m) {
	pointerX = m.pageX;
	pointerY = m.pageY;
	updatesSinceMouseMove = 0;
	mouseMove = true;
}

getCanvas()

let speed = 2;
let scale = ((canvas.width*0.15)/1920).toFixed(2);
let ctx;
let logoColor = "#000";

let r = 255;
let g = 0;
let b = 0;
let mode;

let dvd = {
    //x: canvas.width/2-(2000*scale/2),
    //y: canvas.height/2-(1020*scale/2),
    x: Math.round(Math.random()*(document.documentElement.clientWidth-(2000*scale))),
    y: Math.round(Math.random()*(document.documentElement.clientHeight-(1020*scale))),
    xspeed: ((Math.random()>=0.5)?1:-1),
    yspeed: ((Math.random()>=0.5)?1:-1),
	xstart: 0,
	ystart: 0,
	xstartspeed: 0,
	ystartspeed: 0,
    img: new Image()
};
dvd.xstart = dvd.x;
dvd.ystart = dvd.y;
dvd.xstartspeed = dvd.xspeed;
dvd.ystartspeed = dvd.yspeed;
forCount = 1;
let cornerCount = 0;
let corner=false;
let updatesSinceCorner;

let trail = {
	x: [],
	y: [],
	length: 32,
	count: 1
};
//let trailx = [];
//let traily = [];
//let trailLength = 32;
//let trailCount = 1;
while(trail.count<=trail.length){
	trail.x.push(dvd.x);
	trail.y.push(dvd.y)
	trail.count += 1;
}
trail.count=1;

function limitNumberWithinRange(num, min, max){
	const MIN = min || 0;
	const MAX = max || 255;
	const parsed = parseInt(num)
	return Math.min(Math.max(parsed, MIN), MAX)
}

function checkCorner(){
	if((dvd.x==0||dvd.x==canvas.width-(dvd.img.width*scale))&&(dvd.y==0||dvd.y==canvas.height-(dvd.img.height*scale))){
		cornerCount+=1;
		corner=true;
		updatesSinceCorner=0;
	}
}
//https://stackoverflow.com/questions/6121203/how-to-do-fade-in-and-fade-out-with-javascript-and-css
// function fade(element) {
    // var op = 1;  // initial opacity
    // var timer = setInterval(function () {
        // if (op <= 0.1){
            // clearInterval(timer);
            // element.style.display = 'none';
        // }
        // element.style.opacity = op;
        // element.style.filter = 'alpha(opacity=' + op * 100 + ")";
        // op -= op * 0.1;
    // }, 50);
// }

(function main(){
	ctx = canvas.getContext("2d");
	dvd.img.src = src;

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

	updates=0;
	updateSpeed=0;

	update();
})();

function update() {
	setTimeout(() => {
		if(egg){style.innerHTML = '.full-screen:before, .full-screen:after {background: '+logoColor+';} *{color:white !important;}';}else{style.innerHTML = '.full-screen:before, .full-screen:after {background: black;} *{color:#0f0 !important;}';}
		if(window.innerHeight == screen.height) {
			// browser is fullscreen
			icon.style.opacity=0;
		}
		else{icon.style.opacity=1;}
		while (updates<=updateSpeed){
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		if(egg){
			dvd.xspeed += (Math.random()*easter.speed)-(easter.speed/2);
			dvd.yspeed += (Math.random()*easter.speed)-(easter.speed/2);
		}
		if(cursor&&!pause){
			dvd.x=pointerX-(dvd.img.width*scale/2)||0;
			dvd.y=pointerY-(dvd.img.height*scale/2)||0;
			checkHitBox();
			checkCorner();
			if(!egg){
			style.innerHTML = '.full-screen:before, .full-screen:after {background: black;} *{color:#0f0 !important; cursor:none;}';}else{
			style.innerHTML = '.full-screen:before, .full-screen:after {background: '+logoColor+';} *{color:white !important; cursor:none;}';}
		}
		ctx.globalCompositeOperation = "destination-over";
		if(!egg){
		ctx.fillStyle = logoColor;
		ctx.fillRect(dvd.x, dvd.y, dvd.img.width*scale, dvd.img.height*scale);
		}
		while(trail.count<=trail.length){
			if(!egg){ctx.fillStyle = 'rgb('+(r-((trail.count*r)/trail.length))+', '+(g-((trail.count*g)/trail.length))+', '+(b-((trail.count*b)/trail.length))+')';}
			else{ctx.fillStyle = 'rgb('+(r+(255-(trail.count*255)/trail.length))+', '+(g+(255-(trail.count*255)/trail.length))+', '+(b+(255-(trail.count*255)/trail.length))+')';}
			ctx.fillRect(trail.x[trail.length-(trail.count-1)], trail.y[trail.length-(trail.count-1)], dvd.img.width*scale, dvd.img.height*scale);
			ctx.fillRect(trail[0], trail[1], dvd.img.width*scale, dvd.img.height*scale);
			trail.count+=1;
		}

		if(egg){
			ctx.fillStyle = logoColor;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}if(!pause){
		trail.x.shift(); trail.y.shift();
		trail.x.push(dvd.x); trail.y.push(dvd.y);}
		trail.count=1;
		ctx.globalCompositeOperation = "source-over";
		ctx.drawImage(dvd.img, dvd.x, dvd.y, dvd.img.width*scale, dvd.img.height*scale);

		if(debug){
			const debugMenu = [
				'debug menu:',
				'canvas: '+canvas.width+'x'+canvas.height,
				'document: '+document.documentElement.clientWidth+'x'+document.documentElement.clientHeight,
				'current position: '+dvd.x+', '+dvd.y,
				'xspeed: '+dvd.xspeed+', yspeed: '+dvd.yspeed,
				'started: '+dvd.xstart+', '+dvd.ystart,
				'started going: '+dvd.xstartspeed+', '+dvd.ystartspeed,
				'rgb: '+r+', '+g+', '+b,
				'color mode: '+mode,
				'scale: '+scale,
				'speed: '+speed,
				'egg: '+egg,
				'keyData: "'+keyData+'"',
				'updatesSinceKeyUp: '+updatesSinceKeyUp,
				'trail.length: '+trail.length,
				'trail.count: '+trail.count,
				'cornerCount: '+cornerCount,
				'updatesSinceCorner: '+updatesSinceCorner,
				'nobounce: '+nobounce,
				'permegg: '+permegg,
				'cursor: '+cursor,
				'circle: '+circle,
				'sinCount: '+sinCount,
				'updates: '+updates,
				'updateSpeed: '+updateSpeed,
				'form: '+formData,
				'eval: '+evaluated,
				'mouseMove: '+mouseMove,
				'updatesSinceMouseMove: '+updatesSinceMouseMove,
				'form.style.opacity: '+form.style.opacity
				
			]

			ctx.fillStyle = '#0f0';
			ctx.font='10px sans-serif';
			forCount = 1;
			for (let i of debugMenu) {
				ctx.fillText(i, 0, forCount*9);
				forCount += 1;
			}
		}

		if(keyUp){
			//if(updatesSinceKeyUp==200 && eggKeyUp){


				//maxColor = Math.max(r,g,b);
				//if(maxColor==r){r=255;g=0;b=0;maxColor='r';}
				//else if(maxColor==g){r=0;g=255;b=0;maxColor='g';}
				//else if(maxColor==b){r=0;g=0;b=255;maxColor='b';}

			//}
			//ttps://stackoverflow.com/questions/5842747/how-can-i-use-javascript-to-limit-a-number-between-a-min-max-value
			r=limitNumberWithinRange(r);
			g=limitNumberWithinRange(g);
			b=limitNumberWithinRange(b);
			updatesSinceKeyUp+=1;
			if(updatesSinceKeyUp>500){keyUp=false;updatesSinceKeyUp=undefined;}

		}
		
		if(corner){
			if(updatesSinceCorner>200){
			ctx.fillStyle='rgb('+(r-((updatesSinceCorner-200)*r)/100)+','+(g-((updatesSinceCorner-200)*g)/100)+','+(b-((updatesSinceCorner-200)*b)/100)+')';
			}else{ctx.fillStyle=logoColor;}
			if(egg){ctx.fillStyle='#fff'}
			if(egg && updatesSinceCorner>200){
			ctx.fillStyle='rgb('+(r+(255-((updatesSinceCorner-200)*255)/100))+', '+(g+(255-((updatesSinceCorner-200)*255)/100))+', '+(b+(255-((updatesSinceCorner-200)*255)/100))+')';}
			ctx.font='50px sans-serif';
			ctx.fillText('You\'ve hit the corner '+cornerCount+' times now!', (canvas.width/2-(ctx.measureText('You\'ve hit the corner '+cornerCount+' times now!').width/2)), 75);
			updatesSinceCorner+=1;
			if(updatesSinceCorner>300){corner=false;updatesSinceCorner=undefined;}
		}

		if(mouseMove){
			if(updatesSinceMouseMove>200&&document.activeElement.id!='input'){
			form.style.opacity = 1-((updatesSinceMouseMove-200)/50);
			button.style.opacity = 1-((updatesSinceMouseMove-200)/50);
			//form.style.filter = 'alpha(opacity=' + op * 100 + ")";
			//op -= op * 0.1;
			}
			else{form.style.opacity=1;button.style.opacity=1;}
			//dvd.x=0;
			if(updatesSinceMouseMove>250&&document.activeElement.id!='input'){
			form.style.opacity=0;
			button.style.opacity=0;
			updatesSinceMouseMove=undefined;
			mouseMove=false;
			}
			if(document.activeElement.id=='input'){form.style.opacity=1;button.style.opacity=1;}
			if(document.activeElement.id!='input'){updatesSinceMouseMove+=1;}
		}

		//declareTrail();

		if(!pause){
		if(circle){dvd.x+=(5*Math.cos(sinCount/50));//+(canvas.width/2-(dvd.img.width*scale/2));
		           dvd.y+=(5*Math.sin(sinCount/50));}//+(canvas.height/2-(dvd.img.height*scale/2));}
		else{dvd.x+=dvd.xspeed;
		     dvd.y+=dvd.yspeed;}
		if(circle){sinCount+=1;}}

		if(!cursor&&!pause){checkHitBox();checkCorner();}
		//pickColor();
		rainbowColor();
		if(egg){rainbowColor();rainbowColor();rainbowColor();}
		getCanvas();
		updates+=1;}
		updates=0;
		scale = ((canvas.width*0.2)/1920).toFixed(2);
		update();
	}, speed)
}


function checkHitBox(){
	if(dvd.x+dvd.img.width*scale >= canvas.width){
		if(!nobounce){dvd.xspeed *= -1;}
		dvd.x += canvas.width-(dvd.x+dvd.img.width*scale);
		//pickColor();
		//ctx.clearRect(0, 0, canvas.width, canvas.height);
	}
	if(dvd.x <= 0){
		if(!nobounce){dvd.xspeed *= -1;}
		dvd.x -= dvd.x;
	}

	if(dvd.y+dvd.img.height*scale >= canvas.height){
		if(!nobounce){dvd.yspeed *= -1;}
		dvd.y += canvas.height-(dvd.y+dvd.img.height*scale);
		//pickColor();
		//ctx.clearRect(0, 0, canvas.width, canvas.height);
	}
	if(dvd.y <= 0){
		if(!nobounce){dvd.yspeed *= -1;}
		dvd.y -= dvd.y;
	}
}

function pickColor(){
	min = 30;
	r = Math.random() * (255 - min) + min;
	g = Math.random() * (255 - min) + min;
	b = Math.random() * (255 - min) + min;

	return 'rgb('+r+', '+g+', '+b+')';
}

function rainbowColor(){
	if(r == 255){
		mode = 0;
	}
	if(g == 255){
		mode = 1;
	}
	if(b == 255){
		mode = 2;
	}

	if(mode == 0){
		//if(!egg){r -= 1;}else{r-=4;}//Math.round(Math.random()*easter.color-(easter.color/2));}
		//if(!egg){g += 1;}else{g+=4;}//Math.round(Math.random()*easter.color-(easter.color/2));}
		r -= 1;
		g += 1;
		logoColor = 'rgb('+r+', '+g+', '+b+')';
		return;
	}
	if(mode == 1){
		//if(!egg){g -= 1;}else{g-=4;}//Math.round(Math.random()*easter.color-(easter.color/2));}
		//if(!egg){b += 1;}else{b+=4;}//Math.round(Math.random()*easter.color-(easter.color/2));}
		g -= 1;
		b += 1;
		logoColor = 'rgb('+r+', '+g+', '+b+')';
		return;
	}
	if(mode == 2){
		//if(!egg){b -= 1;}else{b-=4;}//Math.round(Math.random()*easter.color-(easter.color/2));}
		//if(!egg){r += 1;}else{r+=4;}//Math.round(Math.random()*easter.color-(easter.color/2));}
		b -= 1;
		r += 1;
		logoColor = 'rgb('+r+', '+g+', '+b+')';
		return;
	}
}

var elem = document.documentElement;

function openFullscreen() {
	if (elem.requestFullscreen) {
		elem.requestFullscreen();
	} else if (elem.webkitRequestFullscreen) { /* Safari */
		elem.webkitRequestFullscreen();
	} else if (elem.msRequestFullscreen) { /* IE11 */
		elem.msRequestFullscreen();
		}
}//}

// catch(e) {
// 	const error = document.createElement("p");
// 	error.innerHTML = e.message;
// 	document.body.appendChild(error);
// }
