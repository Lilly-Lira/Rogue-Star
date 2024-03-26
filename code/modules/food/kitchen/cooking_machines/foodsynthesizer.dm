//Poojy's miracle 'I don't want generic pizza' / there's noone working kitchen machine
//Yes it's a generic food 3d printer. ~
// in here because makes sense, if really it's just a refillable autolathe of food

//#define VOICE_ORDER(A, O, T) list(activator = A, order = O, temp = T)
// "Computer, Steak, Hot."

/obj/machinery/synthesizer
	name = "food synthesizer"
	desc = "Sabresnacks brand device able to produce an incredible array of conventional foods. Although only the most ascetic of users claim it produces truly good tasting products."
	icon = 'icons/obj/machines/foodsynthesizer.dmi'
	icon_state = "synthesizer"
	pixel_y = 32 //So it glues to the wall
	density = FALSE
	anchored = TRUE
	use_power = USE_POWER_IDLE
	idle_power_usage = 10
	active_power_usage = 2000
	clicksound = "keyboard"
	clickvol = 30

	var/hacked = FALSE
	var/disabled = FALSE
	var/shocked = FALSE
	var/busy = FALSE
	var/usage_amt = 5

	light_system = STATIC_LIGHT
	light_range = 3
	light_power = 1
	light_on = FALSE

	var/menu_grade //how tasty is it?
	var/speed_grade //how fast can it be?
	var/filtertext

	circuit = /obj/item/weapon/circuitboard/synthesizer
	var/datum/wires/synthesizer/wires = null

	//loaded cartridge
	var/obj/item/weapon/reagent_containers/synthdispcart/cart
	var/cart_type = ITEMSIZE_LARGE

	//all of our food
	var/static/datum/category_collection/synthesizer/synthesizer_recipes
	var/list/recipe_list
	var/static/list/menucatagory_list
	var/active_menu = "appasnacc"
	var/food_mimic_storage

	//Voice activation stuff
	var/activator = "computer"
	var/list/voicephrase

	//crew printing required stuff.
	var/datum/data/record/activecrew
	var/refresh_delay = 1 MINUTE


/obj/machinery/synthesizer/Initialize()
	. = ..()
	if(!synthesizer_recipes)
		synthesizer_recipes = new()
	cart = new /obj/item/weapon/reagent_containers/synthdispcart(src)
	wires = new(src)
//	our_db = SStranscore.db_by_key(db_key)
	default_apply_parts()
	RefreshParts()
	update_icon()

/obj/machinery/synthesizer/mini
	name = "small food synthesizer"
	icon = 'icons/obj/machines/foodsynthesizer.dmi'
	icon_state = "portsynth"
	cart_type = ITEMSIZE_NORMAL

/obj/machinery/synthesizer/mini/Initialize()
	. = ..()
	if(!synthesizer_recipes)
		synthesizer_recipes = new()
	cart = new /obj/item/weapon/reagent_containers/synthdispcart/small(src)
	wires = new(src)
//	our_db = SStranscore.db_by_key(db_key)
	default_apply_parts()
	RefreshParts()
	update_icon()

/obj/machinery/synthesizer/Destroy()
	qdel(wires)
	wires = null

	for(var/obj/item/weapon/reagent_containers/synthdispcart/C in cart)
		C.loc = get_turf(src.loc)
		C = null
	return ..()

/obj/machinery/synthesizer/examine(mob/user)
	. = ..()
	if(panel_open)
		. += "The cartridge is [cart ? "installed" : "missing"]."
	if(cart && (!(stat & (NOPOWER|BROKEN))))
		var/obj/item/weapon/reagent_containers/synthdispcart/C = cart
		if(istype(C) && C.reagents && C.reagents.total_volume)
			var/percent = round((C.reagents.total_volume / C.volume) * 100)
			. += "The installed cartridge has [percent]% remaining."

	return

// TGUI to do.

/obj/machinery/synthesizer/ui_assets(mob/user)
	return list(
		get_asset_datum(/datum/asset/spritesheet/synthesizer),
	)

/obj/machinery/synthesizer/tgui_interact(mob/user, datum/tgui/ui)
	if(stat & (BROKEN|NOPOWER))
		return

	if(shocked)
		shock(user, 100)

	ui = SStgui.try_update_ui(user, src, ui)
	if(!ui)
		ui = new(user, src, "FoodSynthesizer")
		ui.open()

/obj/machinery/synthesizer/tgui_status(mob/user)
	if(disabled)
		return STATUS_CLOSE
	return ..()

/obj/machinery/synthesizer/tgui_data(mob/user, datum/tgui/ui, datum/tgui_state/state)
	var/list/data = ..()

	data["busy"] = busy
	data["isThereCart"] = cart ? TRUE : FALSE
	data["active_menu"] = active_menu
	//We probably want to dynamically check if there's a canister every time too.
	var/cartfilling[0]
	if(cart && cart.reagents && cart.reagents.reagent_list.len)
		for(var/datum/reagent/R in cart.reagents.reagent_list)
			cartfilling.Add(list(list(
				"name" = R.name,
				"id" = R.id,
				"volume" = R.volume
				)))
	data["cartfilling"] = cartfilling
	//Especially since we need to maintain a 'fill level'
	if(cart)
		var/percent = round((cart.reagents.total_volume / cart.reagents.maximum_volume) * 100)
		data["cartFillStatus"] = cart ? percent : null


	if(!isnull(data_core.general))
		var/list/records = list()
		data["records"] = records
		for(var/datum/data/record/R in sortRecord(data_core.general))
			records[++records.len] = list(
			"ref" = "\ref[R]",
			"id" = R.fields["id"],
			"name" = R.fields["name"])

	data["activecrew"] = activecrew
	if(activecrew) //starts off null so we'll wait for user input
		var/list/crewdata = list() //Gotta ensure we grab this info from compliant people only
		if(istype(activecrew, /datum/data/record) && data_core.general.Find(activecrew)) //Scrape from security datacore info
			var/list/fields = list()
			crewdata["fields"] = fields
			fields[++fields.len] = FIELD("Name", activecrew.fields["name"], "name")
			fields[++fields.len] = FIELD("ID", activecrew.fields["id"], "id")
			fields[++fields.len] = FIELD("Rank", activecrew.fields["rank"], "rank")
			fields[++fields.len] = FIELD("Entity Classification", activecrew.fields["brain_type"], "brain_type")
			fields[++fields.len] = FIELD("Sex", activecrew.fields["sex"], "sex")
			fields[++fields.len] = FIELD("Species", activecrew.fields["species"], "species")
			var/list/photos = list()
			crewdata["photos"] = photos
			photos[++photos.len] = activecrew.fields["photo-south"]
			crewdata["has_photos"] = (activecrew.fields["photo-south"] ? 1 : 0)
		data["crewdata"] = crewdata

	return data

/obj/machinery/synthesizer/tgui_static_data(mob/user)
	var/list/data = ..()
	var/list/menucatagories = list()
	var/list/recipes = list()
	for(var/datum/category_group/synthesizer/menulist in synthesizer_recipes.categories)
		menucatagories.Add(list(list(
			"name"		= menulist.name,
			"id"		= menulist.id,
			"sortorder"	= menulist.sortorder,
			"ref"		= "\ref[menulist]"
			)))
		for(var/datum/category_item/synthesizer/food in menulist.items)
			recipes.Add(list(list(
				"catagory" 		= menulist.id,
				"name" 			= food.name,
				"desc" 			= food.desc,
				"icon" 			= food.icon,
				"icon_state"	= food.icon_state,
				"path"			= food.path,
				"voice_order"	= food.voice_order,
				"voice_temp"	= food.voice_temp,
				"hidden"		= food.hidden,
				"isatom" 		= ispath(food.path, /atom),
				"photopath" 	= replacetext(replacetext("[food.path]", "/obj/item/", ""), "/", "-"),
				"ref"			= "\ref[food]"
				)))

	data["menucatagories"] = menucatagories
	data["recipes"] = recipes

	var/list/crew_cookies = list()
	for(var/client/C in GLOB.clients)
		// Allow opt-out. For extra protection we'll refrain from including logged out folks.
		if(C?.mob?.mind && !C?.prefs?.synth_cookie)
			continue

		var/name = null
		var/species = null

		if(iscarbon(C.mob))
			var/mob/living/carbon/human/H = C.mob
			if(data_core && data_core.general)
				if(!find_general_record("name", H.real_name))
					if(!find_record("name", H.real_name, data_core.hidden_general))
						continue
			name = H.real_name
			species = "[H.custom_species ? H.custom_species : H.species.name]"

		if(issilicon(C.mob))
			if(isAI(C.mob))
				var/mob/living/silicon/ai/A = C.mob
				name = A.name
				species = "Artificial Intelligence"

			if(isrobot(C.mob))
				var/mob/living/silicon/robot/R = C.mob
				if(R.scrambledcodes || (R.module && R.module.hide_on_manifest)) //Not sure if admeme events want valid cookie print outs
					continue
				name = R.name
				species = "[R.modtype] [R.braintype]"

		if(isanimal(C.mob))
			var/mob/living/simple_mob/SM = C.mob
			name = SM.name
			species = initial(SM.name) //most mobs are simply named the species they are, so this ought to be useful for named critters.

		if(!name)
			continue

		// our crew cookies are only applicable on the crew menu, and we're reusing our catagory sorting as much as possible!
		crew_cookies.Add(list(list(
				"catagory" = "crew",
				"name" = name,
				"species" = species
		)))

	data["crew_cookies"] = crew_cookies

	return data

/obj/machinery/synthesizer/tgui_act(action, list/params, datum/tgui/ui, datum/tgui_state/state)
	if(stat & (BROKEN|NOPOWER))
		return
	if(usr.stat || usr.restrained())
		return
	if(..())
		return TRUE

	usr.set_machine(src)
	add_fingerprint(usr)

	if(busy)
		to_chat(usr, "<span class='notice'>The synthesizer is busy. Please wait for completion of previous operation.</span>")
		playsound(src, 'sound/machines/replicator_input_failed.ogg', 100, 1)
		return

	switch(action)
		if("setactive_menu")
			active_menu = params["setactive_menu"]
			return TRUE

		if("setactive_crew")
			var/datum/data/record/general_record = locate(params["setactive_crew"] || "")
				if(!data_core.general.Find(general_record))
					return
			activecrew = general_record
			return TRUE

		if("crew_photo")
			var/icon/photo = get_photo(usr)
			if(photo && activecrew)
				activecrew.fields["photo_front"] = photo
				activecrew.fields["photo-south"] = "'data:image/png;base64,[icon2base64(photo)]'"
			return TRUE

		if("make")
			var/datum/category_item/synthesizer/making = locate(params["make"])
			if(!istype(making))
				return
			if(making.hidden && !hacked)
				return

			//Check if we still have the materials.
			var/obj/item/weapon/reagent_containers/synthdispcart/C = cart
			if(src.check_cart(C, usr))
				//Sanity check.
				if(!making || !src)
					return
				busy = TRUE
				update_use_power(USE_POWER_ACTIVE)
				update_icon() // light up time
				playsound(src, 'sound/machines/replicator_input_ok.ogg', 100)
				C.reagents.remove_reagent("synthsoygreen", 5) //
				var/obj/item/weapon/reagent_containers/food/snacks/food_mimic = new making.path(src) //Let's get this on a tray
				food_mimic_storage = food_mimic //nice.
				sleep(speed_grade) //machine go brrr
				playsound(src, 'sound/machines/replicator_working.ogg', 150)

				//Create the desired item.
				var/obj/item/weapon/reagent_containers/food/snacks/synthsized_meal/meal = new /obj/item/weapon/reagent_containers/food/snacks/synthsized_meal(src.loc)

				//Begin mimicking the food
				meal.name = food_mimic.name
				meal.desc = food_mimic.desc
				meal.icon = food_mimic.icon
				meal.icon_state = food_mimic.icon_state
				meal.center_of_mass = food_mimic.center_of_mass

				//flavor mixing
				var/taste_output = food_mimic.reagents.generate_taste_message()
				for(var/datum/reagent/F in meal.reagents.reagent_list)
					if(F.id == "nutripaste") //This should be the only reagent, actually.
						F.taste_description += " as well as [taste_output]"
						F.data = list(F.taste_description = 1)
						meal.nutriment_desc = list(F.taste_description = 1)

				if(src.menu_grade >= 2) //Is the machine upgraded?
					meal.reagents.add_reagent("nutripaste", ((1 * src.menu_grade) - 1)) //add the missing Nutriment bonus, subtracting the one we've already added in.

				meal.bitesize = food_mimic?.bitesize //suffer your aerogel like 1 Nutriment turkey, nerds.
				meal.filling_color = food_mimic?.filling_color
				meal.trash = food_mimic?.trash	//If this can lead to exploits then we'll remove it, but I like the idea.
				qdel(food_mimic)
				src.food_mimic_storage = null
				src.audible_message("<span class='notice'>Please take your [meal.name].</span>", runemessage = "[meal.name] is complete!")
				if(Adjacent(usr))
					usr.put_in_any_hand_if_possible(meal) //Autoplace in hands to save a click
				else
					meal.loc = src.loc //otherwise we anti-clump layer onto the floor
					meal.randpixel_xy()
				busy = FALSE
				update_icon() //turn off lights, please.
			else
				src.audible_message("<span class='notice'>Error: Insufficent Materials. SabreSnacks recommends you have a genuine replacement cartridge available to install.</span>", runemessage = "Error: Insufficent Materials!")

			return TRUE

		if("refresh")
			var/delay	//spam protection baybeee. Never trust your users! Especially with expensive lists!!
			if(world.time > delay)
				update_tgui_static_data(usr, ui)
				delay = world.time + refresh_delay
				return TRUE
			else
				to_chat(usr, "<span class='danger'>Spam Protection cooldown isn't finished! Please wait [round(delay/60)] seconds...</span>")

		if("crewprint")
	/*		var/datum/category_item/synthesizer/making = locate(params["crewprint"])
			if(!istype(making))
				return
			if(making.hidden && !hacked)
				return

			//Check if we still have the materials.
			var/obj/item/weapon/reagent_containers/synthdispcart/C = cart
			if(src.check_cart(usr, C))
				//Sanity check.
				if(!making || !src)
					return
				if(istype(active_br))
					busy = TRUE
					update_use_power(USE_POWER_ACTIVE)
					update_icon() // light up time
					playsound(src, 'sound/machines/replicator_input_ok.ogg', 100)
					var/obj/item/weapon/reagent_containers/food/snacks/food_mimic = new making.path(src)
					making.client.prefs.dress_preview_mob(making.mannequin)
					food_mimic_storage = mannequin //stuff the micro in the scanner
					sleep(speed_grade) //machine go brrr
					playsound(src, 'sound/machines/replicator_working.ogg', 150)

					//Create the cookie base.
					var/obj/item/weapon/reagent_containers/food/snacks/synthsized_meal/crewblock/meal = new /obj/item/weapon/reagent_containers/food/snacks/synthsized_meal/crewblock(src.loc)

					//Begin mimicking the micro
					meal.name = data["crewdata"]["fields"]
					meal.desc = "A tiny replica of a crewmate!"
					meal.icon = mannequin.icon
					meal.icon_state = mannequin.icon_state

					//flavor mixing
					var/taste_output = food_mimic.reagents.generate_taste_message()
					for(var/datum/reagent/F in meal.reagents.reagent_list)
						if(F.id == "nutripaste") //This should be the only reagent, actually.
							F.taste_description += " as well as [taste_output]"
							F.data = list(F.taste_description = 1)
							meal.nutriment_desc = list(F.taste_description = 1)

					if(src.menu_grade >= 2) //Is the machine upgraded?
						meal.reagents.add_reagent("nutripaste", ((1 * src.menu_grade) - 1)) //add the missing Nutriment bonus, subtracting the one we've already added in.

					meal.bitesize = 1 //Smol tiny critter mimics
					meal.filling_color = food_mimic?.filling_color
					meal.trash = food_mimic?.trash	//If this can lead to exploits then we'll remove it, but I like the idea.
					qdel(food_mimic)
					src.food_mimic_storage = null
					src.audible_message("<span class='notice'>Please take your [meal.name].</span>", runemessage = "[meal.name] is complete!")
					if(Adjacent(usr))
						usr.put_in_any_hand_if_possible(meal) //Autoplace in hands to save a click
					else
						meal.loc = src.loc //otherwise we anti-clump layer onto the floor
						meal.randpixel_xy()
					busy = FALSE
					update_icon() //turn off lights, please.
			else
				src.audible_message("<span class='notice'>Error: Insufficent Materials. SabreSnacks recommends you have a genuine replacement cartridge available to install.</span>", runemessage = "Error: Insufficent Materials!")

			return TRUE */
	return FALSE

/obj/machinery/synthesizer/update_icon()
	cut_overlays()

	icon_state = initial(icon_state) //we use this to reduce code bloat. It's nice.
	if(panel_open)
		icon_state = "[initial(icon_state)]_off"
		 //add service panels just above our machine
		if(!(stat & (NOPOWER|BROKEN)))
			add_overlay("[initial(icon_state)]_ppanel")
		else
			add_overlay("[initial(icon_state)]_panel")
		if(cart)
			var/obj/item/weapon/reagent_containers/synthdispcart/C = cart
			if(C.reagents && C.reagents.total_volume)
				var/image/filling_overlay = image("[icon]", src, "[initial(icon_state)]fill_0")	//Modular filling
				var/percent = round((C.reagents.total_volume / C.volume) * 100)
				switch(percent)
					if(0 to 9)			filling_overlay.icon_state = "[initial(icon_state)]fill_0"
					if(10 to 35)		filling_overlay.icon_state = "[initial(icon_state)]fill_25"
					if(36 to 74)		filling_overlay.icon_state = "[initial(icon_state)]fill_50"
					if(75 to 90)		filling_overlay.icon_state = "[initial(icon_state)]fill_75"
					if(91 to 99)		filling_overlay.icon_state = "[initial(icon_state)]fill_100"
					if(100 to INFINITY)	filling_overlay.icon_state = "[initial(icon_state)]fill_100"
				filling_overlay.color = C.reagents.get_color()
				//Add our filling, if any.
				add_overlay(filling_overlay)
			//Then add our cart so the filling is inside of the canister.
			add_overlay("[initial(icon_state)]_cart")
	else
		icon_state = "[initial(icon_state)]_on"

	if(stat & NOPOWER)
		icon_state = "[initial(icon_state)]_off"
		set_light_on(FALSE)
		return

	if(busy)
		icon_state = "[initial(icon_state)]_busy"
		set_light_color("#faebd7") // "antique white"
		set_light_on(TRUE)
	else
		set_light_on(FALSE)

//Cartridge Interactions in Machine
/obj/machinery/synthesizer/proc/add_cart(obj/item/weapon/C, mob/user)
	if(!Adjacent(user))
		return //How did you even try?
	if(!panel_open) //just in case
		to_chat(user, "The hatch must be open to insert a [C].")
		return
	if(cart) // let's hot swap that bad boy.
		remove_cart(user)
		return
	else
		user.drop_from_inventory(C)
		cart = C
		C.loc = src
		C.add_fingerprint(user)
		to_chat(user, "<span class='notice'>You add [C] to \the [src].</span>")
	update_icon()
	SStgui.update_uis(src)
	return

/obj/machinery/synthesizer/proc/remove_cart(mob/user)
	var/obj/item/weapon/reagent_containers/synthdispcart/C = cart
	if(!C)
		to_chat(user, "<span class='notice'>There's no cartridge here...</span>") //Sanity checks aren't ever a bad thing
		return
	if(!Adjacent(user)) //gotta, y'know, be in touch range to pull a physical canister out
		return
	C.loc = get_turf(loc)
	C.update_icon()
	cart = null


	// let's check to see if you're holding a different tank
	var/obj/item/weapon/reagent_containers/synthdispcart/R = (user.get_active_hand() || user.get_inactive_hand())
	if(!istype(R)) //You're not, so we move on
		to_chat(user, "<span class='notice'>You remove [C] from  \the [src].</span>")
	if(R.w_class > cart_type) // You are, but it's a large canister and you're trying to stuff it into the portable
		to_chat(user, "<span class='notice'>You remove [C] from  \the [src].</span>")
	else
		add_cart(R, user)
	if(Adjacent(user))
		user.put_in_hands(C) //pick up your trash, nerd. and don't hand it to the AI. They will be upset.
	update_icon()
	SStgui.update_uis(src)

/obj/machinery/synthesizer/proc/check_cart(obj/item/weapon/reagent_containers/synthdispcart/C, mob/user)
	if(!istype(C))
		to_chat(user, "<span class='notice'>The synthesizer cartridge is nonexistant.</span>")
		playsound(src, 'sound/machines/replicator_input_failed.ogg', 100)
		return FALSE
	if((!(C.reagents)) || (C.reagents.total_volume <= 0) || (!C.reagents.has_reagent("synthsoygreen")))
		to_chat(user, "<span class='notice'>The synthesizer cartridge is empty.</span>")
		playsound(src, 'sound/machines/replicator_input_failed.ogg', 100)
		return FALSE
	else if(C.reagents && C.reagents.has_reagent("synthsoygreen") && (C.reagents.total_volume >= 5))
		SStgui.update_uis(src)
		return TRUE

/obj/machinery/synthesizer/attackby(obj/item/W, mob/user)
	if(busy)
		playsound(src, 'sound/machines/replicator_input_failed.ogg', 100)
		audible_message("<span class='notice'>\The [src] is busy. Please wait for completion of previous operation.</span>", runemessage = "The Synthesizer is busy.")
		return
	if(default_part_replacement(user, W))
		return
	if(stat)
		update_icon()
		return
	if(W.is_screwdriver())
		panel_open = !panel_open
		playsound(src, W.usesound, 50, 1)
		user.visible_message("<span class='notice'>[user] [panel_open ? "opens" : "closes"] the hatch on the [src].</span>", "<span class='notice'>You [panel_open ? "open" : "close"] the hatch on the [src].</span>")
		update_icon()
		return
	if(panel_open)
		if(istype(W, /obj/item/weapon/reagent_containers/synthdispcart))
			if(!anchored)
				to_chat(user, "<span class='warning'>Anchor its bolts first.</span>")
				return
			if(W.w_class > cart_type) //since we confirmed it's a Cart, make sure it fits!
				to_chat(user, "<span class='warning'>\The [src] only accepts smaller synthiziser cartridges.</span>")
				return
			if(cart)
				var/choice = alert(user, "Replace the loaded cartridge?", "", "Yes", "Cancel")
				switch(choice)
					if("Cancel")
						return FALSE
					if("Yes")
						add_cart(W, user)
			else
				add_cart(W, user)

	if(W.is_wrench())
		playsound(src, W.usesound, 50, 1)
		to_chat(user, "<span class='notice'>You begin to [anchored ? "un" : ""]fasten \the [src].</span>")
		if (do_after(user, 20 * W.toolspeed))
			user.visible_message(
				"<span class='notice'>\The [user] [anchored ? "un" : ""]fastens \the [src].</span>",
				"<span class='notice'>You have [anchored ? "un" : ""]fastened \the [src].</span>",
				"You hear a ratchet.")
			anchored = !anchored
		else
			to_chat(user, "<span class='notice'>You decide not to [anchored ? "un" : ""]fasten \the [src].</span>")

	if(default_deconstruction_crowbar(user, W))
		return

	else
		return ..()

/obj/machinery/synthesizer/attack_hand(mob/user as mob)
	if(stat & (BROKEN|NOPOWER))
		return
	if(!panel_open)
		user.set_machine(src)
		tgui_interact(user)
	else if(panel_open)
		if(cart)
			var/choice = alert(user, "Removing the Cartridge?", "", "Yes", "Cancel", "Wires Menu")
			switch(choice)
				if("Cancel")
					return FALSE
				if("Yes")
					remove_cart(user)
				if("Wires Menu")
					wires.Interact(user)
		else
			wires.Interact(user)
		return

/obj/machinery/synthesizer/attack_ai(mob/user)
	return attack_hand(user)

/obj/machinery/synthesizer/interact(mob/user)
	if(panel_open)
		return wires.Interact(user)

	if(disabled)
		to_chat(user, "<span class='danger'>\The [src] is disabled!</span>")
		return

	if(shocked)
		shock(user, 50)

	tgui_interact(user)

//Updates performance
/obj/machinery/synthesizer/RefreshParts()
	..()
	menu_grade = 0
	speed_grade = 0

	for(var/obj/item/weapon/stock_parts/manipulator/M in component_parts)
		speed_grade = (10 SECONDS) / M.rating //let's try to make it worthwhile to upgrade 'em 10s, 5s, 3.3s, 2.5s
	for(var/obj/item/weapon/stock_parts/scanning_module/S in component_parts)
		menu_grade = S.rating //how much bonus Nutriment is added to the printed food. the regular wafer is only 1
		// Science parts will be of help if they bother.
	update_tgui_static_data(usr)

//Cartridge Item handling
/obj/item/weapon/reagent_containers/synthdispcart
	name = "Synthesizer cartridge"
	desc = "Genuine replacement cartridge for SabreSnacks brand Food Synthesizers. It's too large for the Portable models."
	icon = 'icons/obj/machines/foodsynthesizer.dmi'
	icon_state = "bigcart"

	w_class = ITEMSIZE_LARGE

	volume = 250 //enough for feeding folk, but not so much it won't be needing replacment
	possible_transfer_amounts = null

/obj/item/weapon/reagent_containers/synthdispcart/small
	name = "Portable Synthesizer Cartridge"
	desc = "Genuine replacement cartrifge SabreSnacks brand Portable Food Synthesizers. It can also fit within standard sized models."
	icon_state = "Scart"
	w_class = ITEMSIZE_NORMAL
	volume = 100

/obj/item/weapon/reagent_containers/synthdispcart/Initialize()
	. = ..()
	reagents.add_reagent("synthsoygreen", volume)
	update_icon()

/obj/item/weapon/reagent_containers/synthdispcart/update_icon()
	cut_overlays()
	if(reagents.total_volume)
		var/image/filling_overlay = image("[icon]", src, "[initial(icon_state)]fill_0", layer = src.layer - 0.1)
		var/percent = round((reagents.total_volume / volume) * 100)
		switch(percent)
			if(0 to 9)			filling_overlay.icon_state = "[initial(icon_state)]fill_0"
			if(10 to 35)		filling_overlay.icon_state = "[initial(icon_state)]fill_25"
			if(36 to 74)		filling_overlay.icon_state = "[initial(icon_state)]fill_50"
			if(75 to 90)		filling_overlay.icon_state = "[initial(icon_state)]fill_75"
			if(91 to 100)		filling_overlay.icon_state = "[initial(icon_state)]fill_100"
			if(100 to INFINITY)	filling_overlay.icon_state = "[initial(icon_state)]fill_100"
		filling_overlay.color = reagents.get_color()
		add_overlay(filling_overlay)

/obj/item/weapon/reagent_containers/synthdispcart/examine(mob/user)
	. = ..()
	if(reagents && reagents.total_volume)
		var/percent = round((reagents.total_volume / volume) * 100)
		. += "The cartridge has [percent]% remaining."

	return

/obj/item/weapon/reagent_containers/synthdispcart/is_open_container()
	return FALSE //sealed, proprietary container. aka preventing alternative beaker memes.

//Circuits for contruction
/datum/design/circuit/synthesizer
	name = "Food Synthesizer"
	id = "food_synthesizer"
	build_path = /obj/item/weapon/circuitboard/synthesizer
	req_tech = list(TECH_DATA = 5, TECH_ENGINEERING = 5, TECH_BLUESPACE = 4)
	sort_string = "PJFSS"

/datum/design/circuit/synthesizer/mini
	name = "Portable Food Synthesizer"
	id = "portablefood_synthesizer"
	build_path = /obj/item/weapon/circuitboard/synthesizer/mini
	req_tech = list(TECH_DATA = 5, TECH_ENGINEERING = 5, TECH_BLUESPACE = 4)
	sort_string = "PJFSM"

// Physical Boards for Food Synthesizer Construction
/obj/item/weapon/circuitboard/synthesizer
	name = T_BOARD("Food Synthesizer")
	build_path = /obj/machinery/synthesizer
	board_type = new /datum/frame/frame_types/machine
	matter = list(MAT_STEEL = 50, MAT_GLASS = 50)
	req_components = list(
		/obj/item/weapon/stock_parts/manipulator = 1,
		/obj/item/weapon/stock_parts/scanning_module = 1)

/obj/item/weapon/circuitboard/synthesizer/mini
	name = T_BOARD("Portable Food Synthesizer")
	build_path = /obj/machinery/synthesizer/mini
	board_type = new /datum/frame/frame_types/machine
	matter = list(MAT_STEEL = 50, MAT_GLASS = 50)
	req_components = list(
		/obj/item/weapon/stock_parts/manipulator = 1,
		/obj/item/weapon/stock_parts/scanning_module = 1)

//Sprite sheet handling
/datum/asset/spritesheet/synthesizer //mimic of vending machines
	name = "synthesizer"

/datum/asset/spritesheet/synthesizer/register()
	for(var/datum/category_item/synthesizer/snacc in subtypesof(/datum/category_item/synthesizer))
		var/icon_file = snacc.icon
		var/icon_state = snacc.icon_state
		var/icon/I
		// construct the icon and slap it into the resource cache
		var/atom/meal = snacc
		if (!ispath(meal, /atom))
			continue
		icon_file = meal.icon
		icon_state = meal.icon_state
		if(!(icon_state in icon_states(icon_file)))
			stack_trace("Food [meal] with icon '[icon_file]' missing state '[icon_state]'")
			continue
		I = icon(icon_file, icon_state, SOUTH)


		var/imgid = replacetext(replacetext("[snacc.path]", "/obj/item/", ""), "/", "-")
		I.Scale(64, 64) //enlarge it to look nicer on the preview
		Insert(imgid, I)
	return ..()

/* Voice activation stuff.
can tgui accept orders that isn't through the menu? Probably. hijack that.

/obj/machinery/synthesizer/hear_talk(mob/M, list/message_pieces, verb)


/obj/machinery/synthesizer/Hear(message, atom/movable/speaker, message_language, raw_message, radio_freq, list/spans, message_mode)
	. = ..()
	if(speaker == src)
		return
	if(!(get_dist(src, speaker) <= 1))
		return
	else
		check_activation(speaker, raw_message)

/obj/machinery/synthesizer/proc/check_activation(atom/movable/speaker, raw_message)
	if(!powered() || busy || panel_open)//Shut down.
		return
	if(!findtext(raw_message, activator))
		return FALSE //They have to say computer, like a discord bot prefix.
	if(!busy)
		if(findtext(raw_message, "?")) //Burger? no be SPECIFIC.
			return FALSE

		if(!findtext(raw_message, ",")) // gotta place pauses between your request. All hail comma.
			audible_message("<span class='notice'>Unable to Comply, Please state request with specific pauses.</span>", runemessage = "BUZZ")
			return

		var/target
		var/temp = null
		for(var/X in all_menus)
			var/tofind = X
			if(findtext(raw_message, order))
				target = order //Alright they've asked for something on the menu.

		for(var/Y in temps) //See if they want it hot, or cold.
			var/temp = Y
			if(findtext(raw_message, T))
				temp = hotorcold //If they specifically request a temperature, we'll oblige. Else it doesn't rename.
		if(target && powered())
			menutype = REPLICATING
			idle_power_usage = 400
			icon_state = "replicator-on"
			playsound(src, 'DS13/sound/effects/replicator.ogg', 100, 1)
			ready = FALSE
			var/speed_mult = 60 //Starts off hella slow.
			speed_mult -= (speed_grade*10) //Upgrade with manipulators to make this faster!

		synthesize(tofind, hotorcold, speaker)


/obj/machinery/synthesizer/proc/synthesize(var/what, var/temp, var/mob/living/user)
	var/atom/food

	/var/list/order = VOICE_ORDER

	tgui_act("add_order", order)

*/
