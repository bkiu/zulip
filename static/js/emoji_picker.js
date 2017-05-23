var emoji_picker = (function () {

var exports = {};

// The functionalities for reacting to a message with an emoji
// and composing a message with an emoji share a single widget,
// implemented as the emoji_popover.
var current_message_emoji_popover_elem;

var promote_popular = (function () {
    function rank(name) {
        switch (name) {
            case '+1': return 1;
            case 'tada': return 2;
            case 'simple_smile': return 3;
            case 'laughing': return 4;
            case '100': return 5;
            default: return 999;
        }
    }

    return function (a, b) {
        var diff = rank(a.name) - rank(b.name);

        if (diff !== 0) {
            return diff;
        }

        return util.strcmp(a.name, b.name);
    };
}());

function compute_placement(elt) {
    var approx_popover_height = 400;
    var approx_popover_width = 400;
    var distance_from_bottom = message_viewport.height() - elt.offset().top;
    var distance_from_right = message_viewport.width() - elt.offset().left;
    var will_extend_beyond_bottom_of_viewport = distance_from_bottom < approx_popover_height;
    var will_extend_beyond_top_of_viewport = elt.offset().top < approx_popover_height;
    var will_extend_beyond_left_of_viewport = elt.offset().left < (approx_popover_width / 2);
    var will_extend_beyond_right_of_viewport = distance_from_right < (approx_popover_width / 2);
    var placement = 'bottom';
    if (will_extend_beyond_bottom_of_viewport && !will_extend_beyond_top_of_viewport) {
        placement = 'top';
    }
    if (will_extend_beyond_right_of_viewport && !will_extend_beyond_left_of_viewport) {
        placement = 'left';
    }
    if (will_extend_beyond_left_of_viewport && !will_extend_beyond_right_of_viewport) {
        placement = 'right';
    }
    return placement;
}

var generate_emoji_picker_content = (function () {
    var emoji_by_unicode = (function () {
        var map = {};

        _.each(emoji.emojis, function (emoji) {
            map[emoji.codepoint] = emoji;
        });

        return {
            find: function (unicode) {
                return map[unicode];
            },

            // this kills the map we create on initial creation so that we can
            // free up memory.
            kill: function () {
                map = null;
            },
        };
    }());

    var emoji_map = Object.assign({}, emoji_codes.emoji_catalog);

    _.each(emoji_map, function (category, key) {
        emoji_map[key] = _.map(category, function (emoji_unicode) {
            var url = emoji.emojis_by_unicode[emoji_unicode];
            var _emoji = emoji_by_unicode.find(emoji_unicode);

            return {
                url: url,
                is_realm_emoji: false,
                name: _emoji ? _emoji.emoji_name : null,
            };
        }).filter(function (emoji) {
            return emoji.name && emoji.url;
        });
    });

    return function (id) {
        emoji_map.Custom = [];
        _.each(emoji.realm_emoji, function (realm_emoji, realm_emoji_name) {
            emoji_map.Custom[realm_emoji_name] = {
                name: realm_emoji_name,
                is_realm_emoji: true,
                url: realm_emoji.emoji_url,
            };
        });

        // Reacting to a specific message
        if (id !== undefined) {
            var emojis_used = reactions.get_emojis_used_by_user_for_message_id(id);
            _.each(emojis_used, function (emoji_name) {
                var unicode = emoji_codes.name_to_codepoint[emoji_name];
                var _emoji = emoji_by_unicode.find(unicode);

                Object.assign(_emoji, {
                    has_reacted: true,
                    css_class: emoji.emojis_name_to_css_class[emoji_name],
                });
            });
        }

        Object.keys(emoji_map).forEach(function (category) {
            if (emoji_map[category].length === 0) {
                delete emoji_map[category];
            }
        });

        var categories = [
            { name: "People", icon: "fa-smile-o" },
            { name: "Nature", icon: "fa-leaf" },
            { name: "Foods", icon: "fa-cutlery" },
            { name: "Activity", icon: "fa-football-o" },
            { name: "Places", icon: "fa-car" },
            { name: "Objects", icon: "fa-lightbulb-o" },
            { name: "Symbols", icon: "fa-hashtag" },
        ];

        var emojis = categories.map(function (category) {
            return Object.assign(category, { emojis: emoji_map[category] });
        });

        _.each(emojis, function (category) {
            category.emojis.sort(promote_popular);
        });

        return templates.render('emoji_popover_content', {
            message_id: id,
            emojis: emojis,
        });
    };
}());

exports.toggle_emoji_popover = function (element, id) {
    var last_popover_elem = current_message_emoji_popover_elem;
    popovers.hide_all();
    $(element).closest('.message_row').toggleClass('has_popover has_emoji_popover');
    if (last_popover_elem !== undefined
        && last_popover_elem.get()[0] === element) {
        // We want it to be the case that a user can dismiss a popover
        // by clicking on the same element that caused the popover.
        return;
    }

    var elt = $(element);
    if (id !== undefined) {
        current_msg_list.select_id(id);
    }

    if (elt.data('popover') === undefined) {
        elt.prop('title', '');
        elt.popover({
            placement: compute_placement(elt),
            template:  templates.render('emoji_popover',   {class: "emoji-info-popover"}),
            title:     "",
            content:   generate_emoji_picker_content(id),
            trigger:   "manual",
        });
        elt.popover("show");
        elt.prop('title', 'Add reaction...');
        $('.emoji-popover-filter').focus();
        $(".emoji-popover-emoji-map").perfectScrollbar({
            suppressScrollX: true,
            useKeyboard: false,
            wheelSpeed: 25,
        });
        current_message_emoji_popover_elem = elt;
        reactions.render_reaction_show_list();
    }
};

exports.reactions_popped = function () {
    return current_message_emoji_popover_elem !== undefined;
};

exports.hide_emoji_popover = function () {
    $('.has_popover').removeClass('has_popover has_emoji_popover');
    if (exports.reactions_popped()) {
        $(".emoji-popover-emoji-map").perfectScrollbar("destroy");
        current_message_emoji_popover_elem.popover("destroy");
        current_message_emoji_popover_elem = undefined;
    }
};


exports.emoji_select_tab = function (elt, offsets) {
    var scrolltop = elt.scrollTop();
    var currently_selected = "";
    for (var i = 0; i < offsets.length; i++) {
        if (scrolltop > offsets[i].position_y) {
            currently_selected = offsets[i].section;
        }
    }
    if (currently_selected) {
        $('.emoji-popover-tab-item.active').removeClass('active');
        $('.emoji-popover-tab-item[data-tab_name="'+currently_selected+'"]').addClass('active);
    }
}

exports.register_click_handlers = function () {
    // Cache the offsets of the emoji sections
    var offsets = [];
    $('.emoji-popover-subheading').each(function () {
        offsets.push({
            'section': $(this).attr('data-section_name'), 
            'position_y': $(this).position().top
        );
    });

    $(document).on('click', '.emoji-popover-emoji.composition', function (e) {
        var emoji_text = ':' + this.title + ':';
        var textarea = $("#new_message_content");
        textarea.caret(emoji_text);
        textarea.focus();
        e.stopPropagation();
        emoji_picker.hide_emoji_popover();
    });

    $("#compose").on("click", "#emoji_map", function (e) {
        e.preventDefault();
        e.stopPropagation();
        emoji_picker.toggle_emoji_popover(this);
    });

    $("#main_div").on("click", ".reactions_hover, .reaction_button", function (e) {
        var row = $(this).closest(".message_row");
        e.stopPropagation();
        emoji_picker.toggle_emoji_popover(this, rows.id(row));
    });

    $("body").on("click", ".actions_popover .reaction_button", function (e) {
        var msgid = $(e.currentTarget).data('message-id');
        e.preventDefault();
        e.stopPropagation();
        // HACK: Because we need the popover to be based off an
        // element that definitely exists in the page even if the
        // message wasn't sent by us and thus the .reaction_hover
        // element is not present, we use the message's
        // .icon-vector-chevron-down element as the base for the popover.
        emoji_picker.toggle_emoji_popover($(".selected_message .icon-vector-chevron-down")[0], msgid);
    });

    $(window).on("scroll", ".emoji-popover-emoji-map", function (e) {
        emoji_picker.emoji_select_tab(this, offsets);
    });
};

exports.is_composition = function (emoji) {
    return emoji.classList.contains('composition');
};

return exports;

}());

if (typeof module !== 'undefined') {
    module.exports = emoji_picker;
}
