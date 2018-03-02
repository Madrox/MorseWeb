
class Tone {
    constructor(hz) {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.osc = this.context.createOscillator();
        this.osc.type = 'sine';
        this.hz = hz;
        this.osc.frequency.setValueAtTime(this.hz, this.context.currentTime);
        this.osc.start();   
        this.started = false;     
    }
    
    start() {
        if (!this.started) {
            this.osc.connect(this.context.destination);
            this.started = true;            
        }
    }

    stop(){
        if (this.started) {
            this.osc.disconnect(this.context.destination);
            this.started = false;            
        }
    }
}


PhraseType = Object.freeze({"letter":1, "word":2, "sentence":5});
T = Object.freeze({"dot": 1, "dash": 3});
EndOf = Object.freeze({"nothing": 0, "letter": 1, "word": 2});

class TapSession {
    constructor(phraseType, oncomplete) {
        this.taps = [];
        this.phraseType = phraseType;
        this.idleTimer = null;
        this.shortest = 99999*9999;
        this.longest = 0;
        this.oncomplete = oncomplete;
        this.inTap = false;
    }

    resetIdleTimeout() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        var context = this;
        this.idleTimer = setTimeout(function(){context.eval()}, this.phraseType*1000);
    }

    beginTap() {
        clearTimeout(this.idleTimer);
        if (this.taps.length > 0) {
            this.taps[this.taps.length-1].nextLetterBegan();
        }
        this.inTap = true;
        this.taps.push(new Tap());
    }

    endTap() {
        if (this.inTap) {
            this.taps[this.taps.length-1].ended();
            if (this.taps[this.taps.length-1].duration < this.shortest) {
                this.shortest = this.taps[this.taps.length-1].duration;
            }
    
            if (this.taps[this.taps.length-1].duration > this.longest) {
                this.longest = this.taps[this.taps.length-1].duration;
            }

            this.inTap = false;
        }
        this.resetIdleTimeout();
    }

    eval() {
        var symbols = [];
        var letters = [];

        var evalSymbols = function() {
            letters.push(Letters[symbols.join('')])
            symbols = [];
        }

        for (let i = 0; i < this.taps.length; i++) {
            const tap = this.taps[i];
            
            var symbol = tap.eval(this.shortest, this.longest);
            symbols.push(symbol);
            if (tap.endOf == EndOf.word) {
                evalSymbols();
                letters.push(" ");
            } else if (tap.endOf == EndOf.letter) {
                evalSymbols();
            }
        }

        evalSymbols();

        this.oncomplete(letters.join(''));
    
        return letters.join('');
    }
}

class Tap {
    constructor() {
        this.start = new Date();
        this.afterPause = 0;
        this.endOf = EndOf.nothing;
        this.deviation = 0;
    }

    ended() {
        this.end = new Date();
    }

    nextLetterBegan() {
        this.afterPause = new Date()-this.end;
    }

    get duration() {
        return this.end-this.start;
    }

    eval(shortest, longest) {
        var period = this.duration/shortest;

        var et = (longest/shortest < 3);

        if (et) { // ET problem
            if (shortest < 130) { // all short
                longest = 4000*shortest;
            } else { // all long
                shortest = longest/3000;
            }
        }
        var cutoff = (longest+shortest)/shortest/9000*4000;

        var t = this.duration/shortest;
        if (this.afterPause/shortest > cutoff*7) { // word pause
            this.endOf = EndOf.word
        } else if (this.afterPause/shortest > cutoff) { // letter pause
            this.endOf = EndOf.letter
        }

        var symbol;
        if (t <=cutoff) { // dot
            symbol = T.dot;
            this.deviation = this.duration - shortest;
        } else { // dash
            symbol = T.dash;
            this.deviation = this.duration - shortest*3;
        }

        return symbol;
    }
}


class Game {
    constructor(onnewphrase, onfinish) {
        this.stage = 0;
        this.currentPhrase = null;
        this.onnewphrase = onnewphrase;
        this.onfinish = onfinish;
        this.done = false;
        this.countdown = null;
        this.newPhrase();
    }

    newPhrase() {
        if (this.stage < 20) {
            this.currentPhrase = this.randomLetter();
        } else {
            this.currentPhrase = this.randomWord();
        }
        var timeLimit = 0;
        if (this.stage >= 5) {
            var lps = (-26.0*this.stage+596.0)/30.0;
            if (lps < 3) {
                lps = 3.0;
            }
            timeLimit = lps*this.currentPhrase.length;
        }
        
        if (this.countdown) {
            clearTimeout(this.countdown);
        }
        if (timeLimit > 0) {
            var context = this;
            this.countdown = setTimeout(function(){context.gameOver()}, timeLimit*1000);
        }
        this.onnewphrase(this.currentPhrase, timeLimit);
    }

    randomLetter() {
        var letter = this.currentPhrase;
        while(letter == this.currentPhrase) {
            letter = Math.random().toString(36).replace(/[^a-z]+/g, '')[0];
        }
        return letter;
    }

    randomWord() {
        var word = this.currentPhrase;
        while(word == this.currentPhrase) {
            word = Words[Math.floor(Math.random()*Words.length)];
        }
        return word;
    }

    score() {
        return this.stage;
    }

    gameOver() {
        this.onfinish(this.score());
        this.done = true;
    }

    userSaid(text) {
        if (!this.done) {
            if (text == this.currentPhrase) {
                this.stage++;
                this.newPhrase();
            } else {
                this.gameOver();
            }
        }
    }
}

class Viz {
    constructor(canvas) {
        this.w = canvas.width();
        this.h = canvas.height();
        this.c = canvas[0].getContext("2d");
        this.c.canvas.width = this.w;
        this.c.canvas.height = this.h;
        this.started = false;
        window.requestAnimationFrame(this.draw.bind(this));
    }

    start() {
        this.started = true;
    }

    stop() {
        this.started = false;
    }

    draw() {
        if (this.c) {
            // shift everything to the left:
            var imageData = this.c.getImageData(1, 0, this.w, this.h);
            this.c.putImageData(imageData, 0, 0);
            // now clear the right-most pixels:
            // this.c.clearRect(this.w-1, 0, 1, this.h);
            if (this.started) {
                this.c.beginPath();

                var offset = 1000;

                this.c.translate(-offset, 0);
                this.c.moveTo(this.w-1,Math.round(this.h*.4));
                this.c.lineTo(this.w-1,Math.round(this.h*.6));
                this.c.lineWidth = 2;
                this.c.shadowOffsetX = offset;
                this.c.shadowColor = 'rgba(0,0,0,0.2)';
                this.c.shadowBlur = 0;
                this.c.stroke();
                this.c.translate(offset, 0);
            }
            window.requestAnimationFrame(this.draw.bind(this));
        }
    }
}

$(document).ready(function() {

    function topScore(score) {
        var top = localStorage.getItem("topScore");
        console.log("Current top score: "+top);
        $("#score").text(top);
        if (!top) {
            top = 0;
        }
        if (score > top) {
            console.log("New top score: "+score);
            top = score;
            $("#score").text(score);
            localStorage.setItem("topScore", top);
        }
    }

    function displayPhrase(phrase) {
        if (game) {
            if (game.currentPhrase == phrase) {
                $(".phrase").last().append("<div class=\"correct response\">"+phrase+"</div>");
            } else {
                $(".phrase").last().append("<div class=\"incorrect response\">"+phrase+"</div>");
            }
            topScore(game.score());
            game.userSaid(phrase);
        } else {
            $(".last-session-result").stop().css({opacity: 1}).text(phrase).animate({opacity: 0}, 5000);
        }
        session = null;
    }    

    function newPhrase(phrase, timeLimit) {
        $(".word").text(phrase).show();
        if (game) {
            $("#current-score").text("Current score: "+game.score());
        }
        if (timeLimit) {
            $(".phrase").stop().css("background-position-x", "100%");
            $(".phrase").animate({
                "background-position-x": "0%"
            }, timeLimit*1000, 'linear');
        }
    }    

    function gameOver(score) {
        $(".phrase").stop().css("background-position-x", "100%");
        $("#current-score").text("Game Over!");
        $(".new-game").show();
        $(".word").hide();
        topScore(score);
        game = null;
    }   

    function fingerDown() {
        if (!session) {
            session = new TapSession(currentPhraseType, displayPhrase);
        }
        session.beginTap();
        viz.start();
        tone.start();
        $(this).css({color: 'rgba(0, 0, 0, 0)'});
    }
    function fingerUp() {
        if (session) {
            session.endTap();
        }
        viz.stop();
        tone.stop();
    }
    
    function newGame() {
        game = new Game(newPhrase, gameOver)
        $(".response").remove();    
        $(".new-game").hide();
    }

    var tone = new Tone(440); //hz
    var session = null;
    var game = null;
    var currentPhraseType = PhraseType.letter;
    var viz = new Viz($("#tap-viz"));
    
    $(".new-game").click(newGame);

    $("#nav-toggle").click(function() {
        $("#game").toggle();
        $("#settings").toggle();
    });

    $("#tap-area").on("vmousedown", fingerDown);
    $("#tap-area").on("vmouseup", fingerUp);
    $("#tap-area").mouseleave(fingerUp);
    $("#tap-area").mouseout(fingerUp);
    $("#tap-area").on("vmousecancel", fingerUp);
    document.addEventListener("keydown", function(event) {
        if (event.keyCode == 32) {
            fingerDown();
        }
    })
    document.addEventListener("keyup", function(event) {
        if (event.keyCode == 32) {
            fingerUp();
        }
    })
    
    topScore(0);
});


Words = Object.freeze([
    "able",
    "about",
    "account",
    "acid",
    "across",
    "act",
    "addition",
    "adjustment",
    "advertisement",
    "after",
    "again",
    "against",
    "agreement",
    "air",
    "all",
    "almost",
    "among",
    "amount",
    "amusement",
    "and",
    "angle",
    "angry",
    "animal",
    "answer",
    "ant",
    "any",
    "apparatus",
    "apple",
    "approval",
    "arch",
    "argument",
    "arm",
    "army",
    "art",
    "as",
    "at",
    "attack",
    "attempt",
    "attention",
    "attraction",
    "authority",
    "automatic",
    "awake",
    "baby",
    "back",
    "bad",
    "bag",
    "balance",
    "ball",
    "band",
    "base",
    "basin",
    "basket",
    "bath",
    "be",
    "beautiful",
    "because",
    "bed",
    "bee",
    "before",
    "behaviour",
    "belief",
    "bell",
    "bent",
    "berry",
    "between",
    "bird",
    "birth",
    "bit",
    "bite",
    "bitter",
    "black",
    "blade",
    "blood",
    "blow",
    "blue",
    "board",
    "boat",
    "body",
    "boiling",
    "bone",
    "book",
    "boot",
    "bottle",
    "box",
    "boy",
    "brain",
    "brake",
    "branch",
    "brass",
    "bread",
    "breath",
    "brick",
    "bridge",
    "bright",
    "broken",
    "brother",
    "brown",
    "brush",
    "bucket",
    "building",
    "bulb",
    "burn",
    "burst",
    "business",
    "but",
    "butter",
    "button",
    "by",
    "cake",
    "camera",
    "canvas",
    "card",
    "care",
    "carriage",
    "cart",
    "cat",
    "cause",
    "certain",
    "chain",
    "chalk",
    "chance",
    "change",
    "cheap",
    "cheese",
    "chemical",
    "chest",
    "chief",
    "chin",
    "church",
    "circle",
    "clean",
    "clear",
    "clock",
    "cloth",
    "cloud",
    "coal",
    "coat",
    "cold",
    "collar",
    "colour",
    "comb",
    "come",
    "comfort",
    "committee",
    "common",
    "company",
    "comparison",
    "competition",
    "complete",
    "complex",
    "condition",
    "connection",
    "conscious",
    "control",
    "cook",
    "copper",
    "copy",
    "cord",
    "cork",
    "cotton",
    "cough",
    "country",
    "cover",
    "cow",
    "crack",
    "credit",
    "crime",
    "cruel",
    "crush",
    "cry",
    "cup",
    "cup",
    "current",
    "curtain",
    "curve",
    "cushion",
    "damage",
    "danger",
    "dark",
    "daughter",
    "day",
    "dead",
    "dear",
    "death",
    "debt",
    "decision",
    "deep",
    "degree",
    "delicate",
    "dependent",
    "design",
    "desire",
    "destruction",
    "detail",
    "development",
    "different",
    "digestion",
    "direction",
    "dirty",
    "discovery",
    "discussion",
    "disease",
    "disgust",
    "distance",
    "distribution",
    "division",
    "do",
    "dog",
    "door",
    "doubt",
    "down",
    "drain",
    "drawer",
    "dress",
    "drink",
    "driving",
    "drop",
    "dry",
    "dust",
    "ear",
    "early",
    "earth",
    "east",
    "edge",
    "education",
    "effect",
    "egg",
    "elastic",
    "electric",
    "end",
    "engine",
    "enough",
    "equal",
    "error",
    "even",
    "event",
    "ever",
    "every",
    "example",
    "exchange",
    "existence",
    "expansion",
    "experience",
    "expert",
    "eye",
    "face",
    "fact",
    "fall",
    "false",
    "family",
    "far",
    "farm",
    "fat",
    "father",
    "fear",
    "feather",
    "feeble",
    "feeling",
    "female",
    "fertile",
    "fiction",
    "field",
    "fight",
    "finger",
    "fire",
    "first",
    "fish",
    "fixed",
    "flag",
    "flame",
    "flat",
    "flight",
    "floor",
    "flower",
    "fly",
    "fold",
    "food",
    "foolish",
    "foot",
    "for",
    "force",
    "fork",
    "form",
    "forward",
    "fowl",
    "frame",
    "free",
    "frequent",
    "friend",
    "from",
    "front",
    "fruit",
    "full",
    "future",
    "garden",
    "general",
    "get",
    "girl",
    "give",
    "glass",
    "glove",
    "go",
    "goat",
    "gold",
    "good",
    "government",
    "grain",
    "grass",
    "great",
    "green",
    "grey",
    "grip",
    "group",
    "growth",
    "guide",
    "gun",
    "hair",
    "hammer",
    "hand",
    "hanging",
    "happy",
    "harbour",
    "hard",
    "harmony",
    "hat",
    "hate",
    "have",
    "he",
    "head",
    "healthy",
    "hear",
    "hearing",
    "heart",
    "heat",
    "help",
    "high",
    "history",
    "hole",
    "hollow",
    "hook",
    "hope",
    "horn",
    "horse",
    "hospital",
    "hour",
    "house",
    "how",
    "humour",
    "ice",
    "idea",
    "if",
    "ill",
    "important",
    "impulse",
    "in",
    "increase",
    "industry",
    "ink",
    "insect",
    "instrument",
    "insurance",
    "interest",
    "invention",
    "iron",
    "island",
    "jelly",
    "jewel",
    "join",
    "journey",
    "judge",
    "jump",
    "keep",
    "kettle",
    "key",
    "kick",
    "kind",
    "kiss",
    "knee",
    "knife",
    "knot",
    "knowledge",
    "land",
    "language",
    "last",
    "late",
    "laugh",
    "law",
    "lead",
    "leaf",
    "learning",
    "leather",
    "left",
    "leg",
    "let",
    "letter",
    "level",
    "library",
    "lift",
    "light",
    "like",
    "limit",
    "line",
    "linen",
    "lip",
    "liquid",
    "list",
    "little",
    "living",
    "lock",
    "long",
    "look",
    "loose",
    "loss",
    "loud",
    "love",
    "low",
    "machine",
    "make",
    "male",
    "man",
    "manager",
    "map",
    "mark",
    "market",
    "married",
    "mass",
    "match",
    "material",
    "may",
    "meal",
    "measure",
    "meat",
    "medical",
    "meeting",
    "memory",
    "metal",
    "middle",
    "military",
    "milk",
    "mind",
    "mine",
    "minute",
    "mist",
    "mixed",
    "money",
    "monkey",
    "month",
    "moon",
    "morning",
    "mother",
    "motion",
    "mountain",
    "mouth",
    "move",
    "much",
    "muscle",
    "music",
    "nail",
    "name",
    "narrow",
    "nation",
    "natural",
    "near",
    "necessary",
    "neck",
    "need",
    "needle",
    "nerve",
    "net",
    "new",
    "news",
    "night",
    "no",
    "noise",
    "normal",
    "north",
    "nose",
    "not",
    "note",
    "now",
    "number",
    "nut",
    "observation",
    "of",
    "off",
    "offer",
    "office",
    "oil",
    "old",
    "on",
    "only",
    "open",
    "operation",
    "opinion",
    "opposite",
    "or",
    "orange",
    "order",
    "organization",
    "ornament",
    "other",
    "out",
    "oven",
    "over",
    "owner",
    "page",
    "pain",
    "paint",
    "paper",
    "parallel",
    "parcel",
    "part",
    "past",
    "paste",
    "payment",
    "peace",
    "pen",
    "pencil",
    "person",
    "physical",
    "picture",
    "pig",
    "pin",
    "pipe",
    "place",
    "plane",
    "plant",
    "plate",
    "play",
    "please",
    "pleasure",
    "plough",
    "pocket",
    "point",
    "poison",
    "polish",
    "political",
    "poor",
    "porter",
    "position",
    "possible",
    "pot",
    "potato",
    "powder",
    "power",
    "present",
    "price",
    "print",
    "prison",
    "private",
    "probable",
    "process",
    "produce",
    "profit",
    "property",
    "prose",
    "protest",
    "public",
    "pull",
    "pump",
    "punishment",
    "purpose",
    "push",
    "put",
    "quality",
    "question",
    "quick",
    "quiet",
    "quite",
    "rail",
    "rain",
    "range",
    "rat",
    "rate",
    "ray",
    "reaction",
    "reading",
    "ready",
    "reason",
    "receipt",
    "record",
    "red",
    "regret",
    "regular",
    "relation",
    "religion",
    "representative",
    "request",
    "respect",
    "responsible",
    "rest",
    "reward",
    "rhythm",
    "rice",
    "right",
    "ring",
    "river",
    "road",
    "rod",
    "roll",
    "roof",
    "room",
    "root",
    "rough",
    "round",
    "rub",
    "rule",
    "run",
    "sad",
    "safe",
    "sail",
    "salt",
    "same",
    "sand",
    "say",
    "scale",
    "school",
    "science",
    "scissors",
    "screw",
    "sea",
    "seat",
    "second",
    "secret",
    "secretary",
    "see",
    "seed",
    "seem",
    "selection",
    "self",
    "send",
    "sense",
    "separate",
    "serious",
    "servant",
    "sex",
    "shade",
    "shake",
    "shame",
    "sharp",
    "sheep",
    "shelf",
    "ship",
    "shirt",
    "shock",
    "shoe",
    "short",
    "shut",
    "side",
    "sign",
    "silk",
    "silver",
    "simple",
    "sister",
    "size",
    "skin",
    "skirt",
    "sky",
    "sleep",
    "slip",
    "slope",
    "slow",
    "small",
    "smash",
    "smell",
    "smile",
    "smoke",
    "smooth",
    "snake",
    "sneeze",
    "snow",
    "so",
    "soap",
    "society",
    "sock",
    "soft",
    "solid",
    "some",
    "son",
    "song",
    "sort",
    "sound",
    "soup",
    "south",
    "space",
    "spade",
    "special",
    "sponge",
    "spoon",
    "spring",
    "square",
    "stage",
    "stamp",
    "star",
    "start",
    "statement",
    "station",
    "steam",
    "steel",
    "stem",
    "step",
    "stick",
    "sticky",
    "stiff",
    "still",
    "stitch",
    "stocking",
    "stomach",
    "stone",
    "stop",
    "store",
    "story",
    "straight",
    "strange",
    "street",
    "stretch",
    "strong",
    "structure",
    "substance",
    "such",
    "sudden",
    "sugar",
    "suggestion",
    "summer",
    "sun",
    "support",
    "surprise",
    "sweet",
    "swim",
    "system",
    "table",
    "tail",
    "take",
    "talk",
    "tall",
    "taste",
    "tax",
    "teaching",
    "tendency",
    "test",
    "than",
    "that",
    "the",
    "then",
    "theory",
    "there",
    "thick",
    "thin",
    "thing",
    "this",
    "thought",
    "thread",
    "throat",
    "through",
    "through",
    "thumb",
    "thunder",
    "ticket",
    "tight",
    "till",
    "time",
    "tin",
    "tired",
    "to",
    "toe",
    "together",
    "tomorrow",
    "tongue",
    "tooth",
    "top",
    "touch",
    "town",
    "trade",
    "train",
    "transport",
    "tray",
    "tree",
    "trick",
    "trouble",
    "trousers",
    "true",
    "turn",
    "twist",
    "umbrella",
    "under",
    "unit",
    "up",
    "use",
    "value",
    "verse",
    "very",
    "vessel",
    "view",
    "violent",
    "voice",
    "waiting",
    "walk",
    "wall",
    "war",
    "warm",
    "wash",
    "waste",
    "watch",
    "water",
    "wave",
    "wax",
    "way",
    "weather",
    "week",
    "weight",
    "well",
    "west",
    "wet",
    "wheel",
    "when",
    "where",
    "while",
    "whip",
    "whistle",
    "white",
    "who",
    "why",
    "wide",
    "will",
    "wind",
    "window",
    "wine",
    "wing",
    "winter",
    "wire",
    "wise",
    "with",
    "woman",
    "wood",
    "wool",
    "word",
    "work",
    "worm",
    "wound",
    "writing",
    "wrong",
    "year",
    "yellow",
    "yes",
    "yesterday",
    "you",
    "young" 
]);


Letters = Object.freeze({
    "13": "a",
    "3111": "b",
    "3131": "c",
    "311": "d",
    "1": "e",
    "1131": "f",
    "331": "g",
    "1111": "h",
    "11": "i",
    "1333": "j",
    "313": "k",
    "1311": "l",
    "33": "m",
    "31": "n",
    "333": "o",
    "1331": "p",
    "3313": "q",
    "131": "r",
    "111": "s",
    "3": "t",
    "113": "u",
    "1113": "v",
    "133": "w",
    "3113": "x",
    "3133": "y",
    "3311": "z",
    "13333": "1",
    "11333": "2",
    "11133": "3",
    "11113": "4",
    "11111": "5",
    "31111": "6",
    "33111": "7",
    "33311": "8",
    "33331": "9",
    "33333": "0",
    "131313": ".",
    "113311": "?",
    "313133": "!",
    "31331": "(",
    "313313": ")",
    "333111": ":",
    "313131": ";",
    "331133": ",",
    "133331": "'",
    "31131": "/",
    "13111": "&",
    "311113": "-",
    "131131": "\""
});
