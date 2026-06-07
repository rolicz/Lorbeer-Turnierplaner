# general
in the entire app, try to avoid wasted horizontal space (ie, the cards I use right now are not optimal and I want to get rid of them entirely). i dont like where the back button is placed, it wastes a lot of vertical space as it starts its own row -> get rid of it and fix the swipe left/right behavior everywhere so i get consistent back/forth behavior. 
everywhere here: avoid wasting horizontal space. refactor input/buttons/switches: in many places they look weird and especially for the switches it's hard to see which option is selected 
i see many different lists and in some places it makes sense to have different ones, but aim for more consitency here as well.
the live indicators are weird: in the navbar, the green dot is too fare to the right and it's not clear what it even means. i also found one below the navbar in the settings page, so it's weird that it is there twice (also at the bottom of the sidebar drawer).
this all is a major design change and i need you to get this right. consistency is very important!!!

# tournaments list
make the tournaments overview list nicer, but include the information that's in there right now. 


# live tournament
in live tournament, separate the current match and the standings in different tabs of the subnavigation. the select clubs option is also not super nice (fix it everywhere there is one) (related to general input/button overhaul). 

# friendlies
the friendlies page does really not look nice. rework a lot and aim for consitency with other pages as ever.

# clubs page
similar as friendlies, streamline/make more consistent with rest of app


# stats
the new stats page is not good, i need a major refactor here. 
while the table is nice, it does not fit well on mobile. rethink the table. maybe selectable table headers with sane defaults are a good option. let me choose all kinds of options that make sense here and their averages as well, but dont make the selection cluttered.
i want a new tab that shows the past tournaments and the positions of each player. maybe put the players in rows and the tournaments (with tournament names) in columns -> indicate if it was a tournamnet with laurels. this should be scrollable horizontally.
it should be possible to add tournament names to the trends graph optionally. make it look and fit nice. the graph should also be zoomable and scrollable. the graph should show month dates on the x-axis (whatever fits there, dont put too many and adjust with zoom level). by default, show everything from up to 1 year ago and get rid of the "show last" slider. if a player did not participate in a trounament, that should also be visible in the graph (before it was less colorful line parts, maybe you can think of something better). use consistent graphs everywhere (e.g. on the dashboard i still see the old graph even though i chose the new stats mode).
in h2h, show the full player names for the matrix, but make each cell same height/width. the h2h lacks a lot of information i had in the old format. check what was there before and integrate it nicely (e.g. let me choose a player).
the streaks page should also show dates in a nice way that does not make it too cluttered. (both concluded and the ongoing streaks)
i miss the stars page entirely: statistics about how well someone plays with certain star ratings. 
wherever i can choose players, spread out the player profile pics over the width and make scrollable if there are many players. use consistent design elements everywhere.

can you think of another stats page that might be interesting? 

# player profile
the players profile page is also not super nace, add the navigation there as well with a nice landing page with profile picture/title page and about in one page.


plan with opus, let me know when to switch to implementation models. add that it should go over the plan until everything is implemented (maybe use a separate markdown for the plan)