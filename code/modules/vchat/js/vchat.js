//The 'V' is for 'VORE' but you can pretend it's for Vue.js if you really want.

(function(){
	// On 516 this is fairly pointless because we can use devtools if we want
	if(navigator.userAgent.indexOf("Trident") >= 0){
		let oldLog = console.log;
		console.log = function (message) {
			send_debug(message);
			oldLog.apply(console, arguments);
		};
		let oldError = console.error;
		console.error = function (message) {
			send_debug(message);
			oldError.apply(console, arguments);
		}
		window.onerror = function (message, url, line, col, error) {
		let stacktrace = "";
		if(error && error.stack) {
			stacktrace = error.stack;
		}
			send_debug(message+" ("+url+"@"+line+":"+col+") "+error+"|UA: "+navigator.userAgent+"|Stack: "+stacktrace);
		return true;
		}
	}
})();

// Button Controls that need background-color and text-color set.
var SKIN_BUTTONS = [
	/* Rpane */ "rpane.textb", "rpane.infob", "rpane.wikib", "rpane.forumb", "rpane.rulesb", "rpane.github", "rpane.discord", "rpane.mapb", "rpane.changelog",
	/* Mainwindow */ "mainwindow.saybutton", "mainwindow.mebutton", "mainwindow.hotkey_toggle"

];
// Windows or controls that need background-color set.
var SKIN_ELEMENTS = [
	/* Mainwindow */ "mainwindow", "mainwindow.mainvsplit", "mainwindow.tooltip",
	/* Rpane */ "rpane", "rpane.rpanewindow", "rpane.mediapanel",
];

function switch_ui_mode(options) {
	doWinset(SKIN_BUTTONS.reduce(function(params, ctl) {params[ctl + ".background-color"] = options.buttonBgColor; return params;}, {}));
	doWinset(SKIN_BUTTONS.reduce(function(params, ctl) {params[ctl + ".text-color"] = options.buttonTextColor; return params;}, {}));
	doWinset(SKIN_ELEMENTS.reduce(function(params, ctl) {params[ctl + ".background-color"] = options.windowBgColor; return params;}, {}));
	doWinset("infowindow", {
		"background-color": options.tabBackgroundColor,
		"text-color": options.tabTextColor
	});
	doWinset("infowindow.info", {
		"background-color": options.tabBackgroundColor,
		"text-color": options.tabTextColor,
		"highlight-color": options.highlightColor,
		"tab-text-color": options.tabTextColor,
		"tab-background-color": options.tabBackgroundColor
	});
}

function doWinset(control_id, params) {
	if (typeof params === 'undefined') {
		params = control_id;  // Handle single-argument use case.
		control_id = null;
	}
	let url = "byond://winset?";
	if (control_id) {
		url += ("id=" + control_id + "&");
	}
	url += Object.keys(params).map(function(ctl) {
		return ctl + "=" + encodeURIComponent(params[ctl]);
	}).join("&");
	window.location = url;
}

//Options for vchat
var vchat_opts = {
	msBeforeDropped: 30000, //No ping for this long, and the server must be gone
	cookiePrefix: "vst-", //If you're another server, you can change this if you want.
	alwaysShow: ["vc_looc", "vc_system"], //Categories to always display on every tab
	vchatTabsVer: 1.0 //Version of vchat tabs save 'file'
};

/***********
* If you are changing either tabBackgroundColor in dark or lightmode,
* lease keep this synchronized with code\modules\examine\examine.dm
* I cannot think of a elegant way to ensure it tracks these settings properly.
* As long as LIGHTMODE stays as "none", stuff should not break.
* Thank you!
************/

var DARKMODE_COLORS = {
	buttonBgColor: "#40628a",
	buttonTextColor: "#FFFFFF",
	windowBgColor: "#272727",
	highlightColor: "#009900",
	tabTextColor: "#FFFFFF",
	tabBackgroundColor: "#272727"
};

var LIGHTMODE_COLORS = {
	buttonBgColor: "none",
	buttonTextColor: "#000000",
	windowBgColor: "none",
	highlightColor: "#007700",
	tabTextColor: "#000000",
	tabBackgroundColor: "none"
};

/***********
*
* Setup Methods
*
************/

var domparser = new DOMParser();
var storage_system = undefined;

// LS only works in 515, and 516 adds a proprietary storage system
if(storageAvailable('serverStorage')){ // >= 516
	storage_system = window.serverStorage;
} else if (storageAvailable('localStorage')) { // <= 515
	storage_system = window.localStorage;
} else {
	send_debug("No storage system available, using cookies. Sad!");
}

//State-tracking variables
var vchat_state = {
	ready: false,

	//Userinfo as reported by byond
	byond_ip: null,
	byond_cid: null,
	byond_ckey: null,

	//Ping status
	lastPingReceived: 0,
	latency_sent: 0,

	//Last ID
	lastId: 0
}

/* eslint-disable-next-line no-unused-vars */ // Invoked directly by byond
function start_vchat() {
	//Instantiate Vue.js
	start_vue();

	//Inform byond we're done
	vchat_state.ready = true;
	push_Topic('done_loading');
	push_Topic_showingnum(this.showingnum);

	//I'll do my own winsets
	doWinset("htmloutput", {"is-visible": true});
	doWinset("oldoutput", {"is-visible": false});
	doWinset("chatloadlabel", {"is-visible": false});

	// RS Add: Workaround for client bug in 515.1642, hide using these methods too
	doWinset("htmloutput", {"size": "0x0"}); // 0,0 is 'take up all space'
	doWinset("oldoutput", {"size": "1x1"});
	doWinset("chatloadlabel", {"size": "1x1"});

	doWinset("htmloutput", {"pos": "0,0"});
	doWinset("oldoutput", {"pos": "999,999"});
	doWinset("chatloadlabel", {"pos": "999,999"});
	// RS Add End

	//Commence the pingening
	setInterval(check_ping, vchat_opts.msBeforeDropped);

	//For fun
	send_debug("VChat Loaded!");
	//throw new Error("VChat Loaded!");

}

//Loads vue for chat usage
var vueapp;
function start_vue() {
	/* eslint-disable-next-line no-undef */ // Present in vue.min.js, imported in HTML
	vueapp = new Vue({
		el: '#app',
		data: {
			messages: [], //List o messages from byond
			shown_messages: [], //Used on filtered tabs, but not "Main" because it has 0len categories list, which bypasses filtering for speed
			unshown_messages: 0, //How many messages in archive would be shown but aren't
			archived_messages: [], //Too old to show
			tabs: [ //Our tabs
				{name: "Main", categories: [], immutable: true, active: true}
			],
			unread_messages: {}, //Message categories that haven't been looked at since we got one of them
			editing: false, //If we're in settings edit mode
			paused: false, //Autoscrolling
			latency: 0, //Not necessarily network latency, since the game server has to align the responses into ticks
			reconnecting: false, //If we've lost our connection
			ext_styles: "", //Styles for chat downloaded files
			is_admin: false,

			//Settings
			inverted: false, //Dark mode
			crushing: 3, //Combine similar messages
			animated: false, //Small CSS animations for new messages
			fontsize: 0.9, //Font size nudging
			lineheight: 130,
			showingnum: 200, //How many messages to show

			//The table to map game css classes to our vchat categories
			type_table: [
				{
					matches: ".filter_say, .say, .emote, .emote_subtle", //VOREStation Edit
					becomes: "vc_localchat",
					pretty: "Local Chat",
					tooltip: "In-character local messages (say, emote, etc)",
					required: false,
					admin: false
				},
				{
					matches: ".filter_radio, .alert, .syndradio, .centradio, .airadio, .entradio, .comradio, .secradio, .engradio, .medradio, .sciradio, .supradio, .srvradio, .expradio, .radio, .deptradio, .newscaster",
					becomes: "vc_radio",
					pretty: "Radio Comms",
					tooltip: "All departments of radio messages",
					required: false,
					admin: false
				},
				{
					matches: ".filter_notice, .notice:not(.pm), .adminnotice, .info, .sinister, .cult",
					becomes: "vc_info",
					pretty: "Notices",
					tooltip: "Non-urgent messages from the game and items",
					required: false,
					admin: false
				},
				{
					matches: ".filter_warning, .warning:not(.pm), .critical, .userdanger, .italics",
					becomes: "vc_warnings",
					pretty: "Warnings",
					tooltip: "Urgent messages from the game and items",
					required: false,
					admin: false
				},
				{
					matches: ".filter_deadsay, .deadsay",
					becomes: "vc_deadchat",
					pretty: "Deadchat",
					tooltip: "All of deadchat",
					required: false,
					admin: false
				},
				{
					matches: ".filter_pray",
					becomes: "vc_pray",
					pretty: "Pray",
					tooltip: "Prayer messages",
					required: false,
					admin: false
				},
				{
					matches: ".ooc, .filter_ooc",
					becomes: "vc_globalooc",
					pretty: "Global OOC",
					tooltip: "The bluewall of global OOC messages",
					required: false,
					admin: false
				},
				//VOREStation Add Start
				{
					matches: ".nif",
					becomes: "vc_nif",
					pretty: "NIF Messages",
					tooltip: "Messages from the NIF itself and people inside",
					required: false,
					admin: false
				},
				//VOREStation Add End
				{
					matches: ".mentor_channel, .mentor",
					becomes: "vc_mentor",
					pretty: "Mentor messages",
					tooltip: "Mentorchat and mentor pms",
					required: false,
					admin: false
				},
				{
					matches: ".filter_pm, .pm",
					becomes: "vc_adminpm",
					pretty: "Admin PMs",
					tooltip: "Messages to/from admins ('adminhelps')",
					required: false,
					admin: false
				},
				{
					matches: ".filter_ASAY, .admin_channel",
					becomes: "vc_adminchat",
					pretty: "Admin Chat",
					tooltip: "ASAY messages",
					required: false,
					admin: true
				},
				{
					matches: ".filter_MSAY, .mod_channel",
					becomes: "vc_modchat",
					pretty: "Mod Chat",
					tooltip: "MSAY messages",
					required: false,
					admin: true
				},
				{
					matches: ".filter_ESAY, .event_channel",
					becomes: "vc_eventchat",
					pretty: "Event Chat",
					tooltip: "ESAY messages",
					required: false,
					admin: true
				},
				{
					matches: ".filter_combat, .danger",
					becomes: "vc_combat",
					pretty: "Combat Logs",
					tooltip: "Urist McTraitor has stabbed you with a knife!",
					required: false,
					admin: false
				},
				{
					matches: ".filter_adminlogs, .log_message",
					becomes: "vc_adminlogs",
					pretty: "Admin Logs",
					tooltip: "ADMIN LOG: Urist McAdmin has jumped to coordinates X, Y, Z",
					required: false,
					admin: true
				},
				{
					matches: ".filter_attacklogs",
					becomes: "vc_attacklogs",
					pretty: "Attack Logs",
					tooltip: "Urist McTraitor has shot John Doe",
					required: false,
					admin: true
				},
				{
					matches: ".filter_debuglogs",
					becomes: "vc_debuglogs",
					pretty: "Debug Logs",
					tooltip: "DEBUG: SSPlanets subsystem Recover().",
					required: false,
					admin: true
				},
				{
					matches: ".looc",
					becomes: "vc_looc",
					pretty: "Local OOC",
					tooltip: "Local OOC messages, always enabled",
					required: true
				},
				{
					matches: ".rlooc",
					becomes: "vc_rlooc",
					pretty: "Remote LOOC",
					tooltip: "Remote LOOC messages",
					required: false,
					admin: true
				},
				{
					matches: ".boldannounce, .filter_system",
					becomes: "vc_system",
					pretty: "System Messages",
					tooltip: "Messages from your client, always enabled",
					required: true
				},
				{
					matches: ".unsorted",
					becomes: "vc_unsorted",
					pretty: "Unsorted",
					tooltip: "Messages that don't have any filters.",
					required: false,
					admin: false
				}
			],
		},
		mounted: function() {
			//Load our settings
			this.load_settings();

			let xhr = new XMLHttpRequest();
			xhr.open('GET', 'ss13styles.css');
			xhr.onreadystatechange = (function() {
				this.ext_styles = xhr.responseText;
			}).bind(this);
			xhr.send();
		},
		updated: function() {
			if(!this.editing && !this.paused) {
				window.scrollTo(0,document.getElementById("messagebox").scrollHeight);
			}
		},
		watch: {
			reconnecting: function(newSetting, oldSetting) {
				if(newSetting == true && oldSetting == false) {
					this.internal_message("Your client has lost connection to the server, or there is severe lag. Your client will reconnect if possible.");
				} else if (newSetting == false && oldSetting == true) {
					this.internal_message("Your client has reconnected to the server.");
				}
			},
			//Save the inverted setting to LS
			inverted: function (newSetting) {
				set_storage("darkmode",newSetting);
				if(newSetting) { //Special treatment for <body> which is outside Vue's scope and has custom css
					document.body.classList.add("inverted");
					switch_ui_mode(DARKMODE_COLORS);
				} else {
					document.body.classList.remove("inverted");
					switch_ui_mode(LIGHTMODE_COLORS);
				}
			},
			crushing: function (newSetting) {
				set_storage("crushing",newSetting);
			},
			animated: function (newSetting) {
				set_storage("animated",newSetting);
			},
			fontsize: function (newSetting, oldSetting) {
				if(isNaN(newSetting)) { //Numbers only
					this.fontsize = oldSetting;
					return;
				}
				if(newSetting < 0.2) {
					this.fontsize = 0.2;
				} else if(newSetting > 5) {
					this.fontsize = 5;
				}
				set_storage("fontsize",newSetting);
			},
			lineheight: function (newSetting, oldSetting) {
				if(!isFinite(newSetting)) { //Integers only
					this.lineheight = oldSetting;
					return;
				}
				if(newSetting < 100) {
					this.lineheight = 100;
				} else if(newSetting > 200) {
					this.lineheight = 200;
				}
				set_storage("lineheight",newSetting);
			},
			showingnum: function (newSetting, oldSetting) {
				if(!isFinite(newSetting)) { //Integers only
					this.showingnum = oldSetting;
					return;
				}

				newSetting = Math.floor(newSetting);
				if(newSetting < 50) {
					this.showingnum = 50;
				} else if(newSetting > 2000) {
					this.showingnum = 2000;
				}

				set_storage("showingnum",this.showingnum);
				push_Topic_showingnum(this.showingnum); // Send the buffer length back to byond so we have it in case of reconnect
				this.attempt_archive();
			},
			current_categories: function(newSetting) {
				if(newSetting.length) {
					this.apply_filter(newSetting);
				}
			}
		},
		computed: {
			//Which tab is active?
			active_tab: function() {
				//Had to polyfill this stupid .find since IE doesn't have EC6
				let tab = this.tabs.find( function(tab) {
					return tab.active;
				});
				return tab;
			},
			//What color does the latency pip get?
			ping_classes: function() {
				if(!this.latency) {
					return this.reconnecting ? "red" : "green"; //Standard
				}

				if (this.latency == "?") { return "grey"; } //Waiting for latency test reply
				else if(this.latency < 0 ) {return "red"; }
				else if(this.latency <= 200) { return "green"; }
				else if(this.latency <= 400) { return "yellow"; }
				else { return "grey"; }
			},
			current_categories: function() {
				if(this.active_tab == this.tabs[0]) {
					return []; //Everything, no filtering, special case for speed.
				} else {
					return this.active_tab.categories.concat(vchat_opts.alwaysShow);
				}
			}
		},
		methods: {
			//Load the chat settings
			load_settings: function() {
				this.inverted = get_storage("darkmode", false);
				this.crushing = get_storage("crushing", 3);
				this.animated = get_storage("animated", false);
				this.fontsize = get_storage("fontsize", 0.9);
				this.lineheight = get_storage("lineheight", 130);
				this.showingnum = get_storage("showingnum", 200);

				if(isNaN(this.crushing)){this.crushing = 3;} //This used to be a bool (03-02-2020)
				if(isNaN(this.fontsize)){this.fontsize = 0.9;} //This used to be a string (03-02-2020)

				this.load_tabs();
			},
			load_tabs: function() {
				let loadstring = get_storage("tabs")
				if(!loadstring)
					return;
				let loadfile = JSON.parse(loadstring);
				//Malformed somehow.
				if(!loadfile.version || !loadfile.tabs) {
					this.internal_message("There was a problem loading your tabs. Any new ones you make will be saved, however.");
					return;
				}
				//Version is old? Sorry.
				if(!loadfile.version == vchat_opts.vchatTabsVer) {
					this.internal_message("Your saved tabs are for an older version of VChat and must be recreated, sorry.");
					return;
				}

				this.tabs.push.apply(this.tabs, loadfile.tabs);
			},
			save_tabs: function() {
				let savefile = {
					version: vchat_opts.vchatTabsVer,
					tabs: []
				}

				//The tabs contain a bunch of vue stuff that gets funky when you try to serialize it with stringify, so we 'purify' it
				this.tabs.forEach(function(tab){
					if(tab.immutable)
						return;

					let name = tab.name;

					let categories = [];
					tab.categories.forEach(function(category){categories.push(category);});

					let cleantab = {name: name, categories: categories, immutable: false, active: false}

					savefile.tabs.push(cleantab);
				});

				let savestring = JSON.stringify(savefile);
				set_storage("tabs", savestring);
			},
			//Change to another tab
			switchtab: function(tab) {
				if(tab == this.active_tab) return;
				this.active_tab.active = false;
				tab.active = true;

				tab.categories.forEach( function(cls) {
					this.unread_messages[cls] = 0;
				}, this);

				this.apply_filter(this.current_categories);
			},
			//Toggle edit mode
			editmode: function() {
				this.editing = !this.editing;
				this.save_tabs();
			},
			//Toggle autoscroll
			pause: function() {
				this.paused = !this.paused;
			},
			//Create a new tab (stupid lack of classes in ES5...)
			newtab: function() {
				this.tabs.push({
					name: "New Tab",
					categories: [],
					immutable: false,
					active: false
				});
				this.switchtab(this.tabs[this.tabs.length - 1]);
			},
			//Rename an existing tab
			renametab: function() {
				if(this.active_tab.immutable) {
					return;
				}
				let tabtorename = this.active_tab;
				let newname = window.prompt("Type the desired tab name:", tabtorename.name);
				if(newname === null || newname === "" || tabtorename === null) {
					return;
				}
				tabtorename.name = newname;
			},
			//Delete the currently active tab
			deltab: function(tab) {
				if(!tab) {
					tab = this.active_tab;
				}
				if(tab.immutable) {
					return;
				}
				this.switchtab(this.tabs[0]);
				this.tabs.splice(this.tabs.indexOf(tab), 1);
			},
			movetab: function(tab, shift) {
				if(!tab || tab.immutable) {
					return;
				}
				let at = this.tabs.indexOf(tab);
				let to = at + shift;
				this.tabs.splice(to, 0, this.tabs.splice(at, 1)[0]);
			},
			tab_unread_count: function(tab) {
				let unreads = 0;
				let thisum = this.unread_messages;
				tab.categories.find( function(cls){
					if(thisum[cls]) {
						unreads += thisum[cls];
					}
				});
				return unreads;
			},
			tab_unread_categories: function(tab) {
				let unreads = false;
				let thisum = this.unread_messages;
				tab.categories.find( function(cls){
					if(thisum[cls]) {
						unreads = true;
						return true;
					}
				});

				return { red: unreads, grey: !unreads};
			},
			attempt_archive: function() {
				let wiggle = 20; //Wiggle room to prevent hysterisis effects. Slice off 20 at a time.
				//Pushing out old messages
				if(this.messages.length > this.showingnum) {//Time to slice off old messages
					let too_old = this.messages.splice(0,wiggle); //We do a few at a time to avoid doing it too often
					Array.prototype.push.apply(this.archived_messages, too_old); //ES6 adds spread operator. I'd use it if I could.
				}/*
				//Pulling back old messages
				} else if(this.messages.length < (this.showingnum - wiggle)) { //Sigh, repopulate old messages
					let too_new = this.archived_messages.splice(this.messages.length - (this.showingnum - wiggle));
					Array.prototype.shift.apply(this.messages, too_new);
				}
				*/
			},
			apply_filter: function(cat_array) {
				//Clean up the array
				this.shown_messages.splice(0);
				this.unshown_messages = 0;

				//For each message, try to find it's category in the categories we're showing
				this.messages.forEach( function(msg){
					if(cat_array.indexOf(msg.category) > -1) { //Returns the position in the array, and -1 for not found
						this.shown_messages.push(msg);
					}
				}, this);

				//For each message, try to find it's category in the categories we're showing
				this.archived_messages.forEach( function(msg){
					if(cat_array.indexOf(msg.category) > -1) { //Returns the position in the array, and -1 for not found
						this.unshown_messages++;
					}
				}, this);
			},
			//Push a new message into our array
			add_message: function(message) {
				//IE doesn't support the 'class' syntactic sugar so we're left making our own object.
				let newmessage = {
					time: message.time,
					category: "error",
					content: message.message,
					repeats: 1
				};

				//Get a category
				newmessage.category = this.get_category(newmessage.content);

				//Put it in unsorted blocks
				if (newmessage.category == "vc_unsorted") {
					newmessage.content = "<span class='unsorted'>" + newmessage.content + "</span>";
				}

				//Try to crush it with one of the last few
				if(this.crushing) {
					let crushwith = this.messages.slice(-(this.crushing));
					for (let i = crushwith.length - 1; i >= 0; i--) {
						let oldmessage = crushwith[i];
						if(oldmessage.content == newmessage.content) {
							newmessage.repeats += oldmessage.repeats;
							this.messages.splice(this.messages.indexOf(oldmessage), 1);
						}
					}
				}

				newmessage.content = newmessage.content.replace(
					/(\b(https?):\/\/[-A-Z0-9+&@#/%?=~_|!:,.;]*[-A-Z0-9+&@#/%=~_|])/img, //Honestly good luck with this regex ~Gear
					'<a href="$1">$1</a>');

				//Unread indicator and insertion into current tab shown messages if sensible
				if(this.current_categories.length && (this.current_categories.indexOf(newmessage.category) < 0)) { //Not in the current categories
					if (isNaN(this.unread_messages[newmessage.category])) {
						this.unread_messages[newmessage.category] = 0;
					}
					this.unread_messages[newmessage.category] += 1;
				} else if(this.current_categories.length) { //Is in the current categories
					this.shown_messages.push(newmessage);
				}

				//Append to vue's messages
				newmessage.id = ++vchat_state.lastId;
				this.attempt_archive();
				this.messages.push(newmessage);
			},
			//Push an internally generated message into our array
			internal_message: function(message) {
				let newmessage = {
					time: this.messages.length ? this.messages.slice(-1).time+1 : 0,
					category: "vc_system",
					content: "<span class='notice'>[VChat Internal] " + message + "</span>"
				};
				newmessage.id = ++vchat_state.lastId;
				this.messages.push(newmessage);
			},
			on_mouseup: function(event) {
				// Focus map window on mouseup so hotkeys work.  Exception for if they highlighted text or clicked an input.
				let ele = event.target;
				let textSelected = ('getSelection' in window) && window.getSelection().isCollapsed === false;
				if (!textSelected && !(ele && (ele.tagName === 'INPUT' || ele.tagName === 'TEXTAREA'))) {
					focusMapWindow();
					if(navigator.userAgent.indexOf("Trident") >= 0){
						// Okay focusing map window appears to prevent click event from being fired.  So lets do it ourselves.
						event.preventDefault();
						event.target.click();
					}
				}
			},
			click_message: function(event) {
				let ele = event.target;
				if(ele.tagName === "A") {
					event.stopPropagation();
					event.preventDefault ? event.preventDefault() : (event.returnValue = false); //The second one is the weird IE method.

					let href = ele.getAttribute('href'); // Gets actual href without transformation into fully qualified URL

					if (href[0] == '?' || (href.length >= 8 && href.substring(0,8) == "byond://")) {
						window.location = href; //Internal byond link
					} else { //It's an external link
						window.location = "byond://?action=openLink&link="+encodeURIComponent(href);
					}
				}
			},
			//Derive a vchat category based on css classes
			get_category: function(message) {
				if(!vchat_state.ready) {
					push_Topic('not_ready');
					return;
				}

				let doc = domparser.parseFromString(message, 'text/html');
				let evaluating = doc.querySelector('span');

				let category = "vc_unsorted"; //What we use if the classes aren't anything we know.
				if(!evaluating) return category;
				this.type_table.find( function(type) {
					if(evaluating.matches(type.matches)) {
						category = type.becomes;
						return true;
					}
				});

				return category;
			},
			save_chatlog: function() {
				let textToSave = "<html><head><style>"+this.ext_styles+"</style></head><body>";

				let messagesToSave = this.archived_messages.concat(this.messages);
				let cats = this.current_categories;

				messagesToSave.forEach( function(message) {
					if(cats.length == 0 || (cats.indexOf(message.category) >= 0)) { //only in the active tab
						textToSave += message.content;
						if(message.repeats > 1) {
							textToSave += "(x"+message.repeats+")";
						}
						textToSave += "<br>\n";
					}
				});
				textToSave += "</body></html>";

				let fileprefix = "log";
				let extension =".html";

				let now = new Date();
				let hours = String(now.getHours());
				if(hours.length < 2) {
					hours = "0" + hours;
				}
				let minutes = String(now.getMinutes());
				if(minutes.length < 2) {
					minutes = "0" + minutes;
				}
				let dayofmonth = String(now.getDate());
				if(dayofmonth.length < 2) {
					dayofmonth = "0" + dayofmonth;
				}
				let month = String(now.getMonth()+1); //0-11
				if(month.length < 2) {
					month = "0" + month;
				}
				let year = String(now.getFullYear());
				let datesegment = " "+year+"-"+month+"-"+dayofmonth+" ("+hours+" "+minutes+")";

				let filename = fileprefix+datesegment+extension;

				let blob = new Blob([textToSave], {type: 'text/html;charset=utf8;'});
				downloadBlob(blob, filename);
			},
			do_latency_test: function() {
				send_latency_check();
			},
			blur_this: function(event) {
				event.target.blur();
			}
		}
	});
}

/***********
*
* Actual Methods
*
************/
function check_ping() {
	let time_ago = Date.now() - vchat_state.lastPingReceived;
	if(time_ago > vchat_opts.msBeforeDropped)
		vueapp.reconnecting = true;
}

//Send a 'ping' to byond
function send_latency_check() {
	if(vchat_state.latency_sent)
			return;

	vchat_state.latency_sent = Date.now();
	vueapp.latency = "?";
	push_Topic("ping");
	setTimeout(function() {
		if(vchat_state.latency_ms == "?") {
			vchat_state.latency_ms = 999;
		}
	}, 1000); // 1 second to reply otherwise we mark it as bad
	setTimeout(function() {
		vchat_state.latency_sent = 0;
		vueapp.latency = 0;
	}, 5000); //5 seconds to display ping time overall
}

function get_latency_check() {
	if(!vchat_state.latency_sent) {
		return; //Too late
	}

	vueapp.latency = Date.now() - vchat_state.latency_sent;
}

//We accept double-url-encoded JSON strings because Byond is garbage and UTF-8 encoded url_encode() text has crazy garbage in it.
function byondDecode(message) {

	//Byond encodes spaces as pluses?! This is 1998 I guess.
	message = message.replace(/\+/g, "%20");
	try {
		message = decodeURIComponent(message);
	} catch (err) {
		message = unescape(message+JSON.stringify(err));
	}
	return JSON.parse(message);
}

//This is the function byond actually communicates with using byond's client << output() method.
/* eslint-disable-next-line no-unused-vars */ // Called directly by byond
function putmessage(messages) {
	messages = byondDecode(messages);
	if (Array.isArray(messages)) {
		messages.forEach(function(message) {
			vueapp.add_message(message);
		});
	} else if (typeof messages === 'object') {
		vueapp.add_message(messages);
	}
}

//Send an internal message generated in the javascript
function system_message(message) {
	vueapp.internal_message(message);
}

//This is the other direction of communication, to push a Topic message back
function push_Topic(topic_uri) {
	window.location = '?_src_=chat&proc=' + topic_uri; //Yes that's really how it works.
}

// Send the showingnum back to byond
function push_Topic_showingnum(topic_num) {
	window.location = '?_src_=chat&showingnum=' + topic_num;
}

//Tells byond client to focus the main map window.
function focusMapWindow() {
	window.location = 'byond://winset?mapwindow.map.focus=true';
}

//Debug event
function send_debug(message) {
	push_Topic("debug&param[message]="+encodeURIComponent(message));
}

//A side-channel to send events over that aren't just chat messages, if necessary.
/* eslint-disable-next-line no-unused-vars */ // Called directly by byond
function get_event(event) {
	if(!vchat_state.ready) {
		push_Topic("not_ready");
		return;
	}

	let parsed_event = {evttype: 'internal_error', event: event};
	parsed_event = byondDecode(event);

	switch(parsed_event.evttype) {
		//We didn't parse it very well
		case 'internal_error':
			system_message("Event parse error: " + event);
			break;

		//They provided byond data.
		case 'byond_player':
			send_client_data();
			vueapp.is_admin = (parsed_event.admin === 'true');
			vchat_state.byond_ip = parsed_event.address;
			vchat_state.byond_cid = parsed_event.cid;
			vchat_state.byond_ckey = parsed_event.ckey;
			set_storage("ip",vchat_state.byond_ip);
			set_storage("cid",vchat_state.byond_cid);
			set_storage("ckey",vchat_state.byond_ckey);
			break;

		//Just a ping.
		case 'keepalive':
			vchat_state.lastPingReceived = Date.now();
			vueapp.reconnecting = false;
			break;

		//Response to a latency test.
		case 'pong':
			get_latency_check();
			break;

		//The server doesn't know if we're loaded or not (we bail above if we're not, so we must be).
		case 'availability':
			push_Topic("done_loading");
			break;

		default:
			system_message("Didn't know what to do with event: " + event);
	}
}

//Send information retrieved from storage
function send_client_data() {
	let client_data = {
		ip: get_storage("ip"),
		cid: get_storage("cid"),
		ckey: get_storage("ckey")
	};
	push_Topic("ident&param[clientdata]="+JSON.stringify(client_data));
}

// The abstract methods.
function set_storage(key, value){
	if(!storage_system) return;
	storage_system.setItem(vchat_opts.cookiePrefix+key,value);
}

function get_storage(key, default_value){
	if(!storage_system) return default_value;
	let value = storage_system.getItem(vchat_opts.cookiePrefix+key);

	//localstorage only stores strings.
	if(value === "null" || value === null) {
		value = default_value;
	//Coerce bools back into their native forms
	} else if(value === "true") {
		value = true;
	} else if(value === "false") {
		value = false;
	//Coerce numbers back into numerical form
	} else if(!isNaN(value)) {
		value = +value;
	}
	return value;
}

function storageAvailable(type) {
	var storage;
	try {
		storage = window[type];
		var x = '__storage_test__';
		storage.setItem(x, x);
		storage.getItem(x);
		storage.removeItem(x);
		return true;
	}
	catch(e) {
		return e instanceof DOMException && (
			// everything except Firefox
			e.code === 22 ||
			// Firefox
			e.code === 1014 ||
			// test name field too, because code might not be present
			// everything except Firefox
			e.name === 'QuotaExceededError' ||
			// Firefox
			e.name === 'NS_ERROR_DOM_QUOTA_REACHED') &&
			// acknowledge QuotaExceededError only if there's something already stored
			(storage && storage.length !== 0);
	}
}

function downloadBlob(blob, fileName) {
	if (
		(navigator.userAgent.indexOf("Trident") >= 0)
		&& navigator.msSaveOrOpenBlob
	) {
		// For old IE/Trident browsers
		navigator.msSaveOrOpenBlob(blob, fileName);
	} else {
		// For modern browsers
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName
		// Append to document to work in Firefox
		document.body.appendChild(a)
		a.click()
		// Clean up
		setTimeout(function() {
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		}, 0);
	}
}
