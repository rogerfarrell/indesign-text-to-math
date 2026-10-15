// Replace the selected text with an inline InDesign MathML object.
// Requires InDesign 2025 (v20) or later (native MathML support).

#target indesign

var MATH_FONT_SIZE = 6; // pt

// ---------------------------------------------------------------------------
// Pure part: text -> MathML string
// ---------------------------------------------------------------------------

// ExtendScript is ES3: no Array.prototype.map or filter, so define them.
function map(xs, f) {
    var out = [];
    for (var i = 0; i < xs.length; i++) out.push(f(xs[i]));
    return out;
}

function filter(xs, keep) {
    var out = [];
    for (var i = 0; i < xs.length; i++) if (keep(xs[i])) out.push(xs[i]);
    return out;
}

// Merge plain objects left to right.
function merge(objs) {
    var out = {};
    for (var i = 0; i < objs.length; i++)
        for (var k in objs[i]) if (objs[i].hasOwnProperty(k)) out[k] = objs[i][k];
    return out;
}

// Build a table entry for each character, wrapped by `toElement`.
function asTyped(toElement, chars) {
    var out = {};
    for (var i = 0; i < chars.length; i++) out[chars[i]] = toElement(chars[i]);
    return out;
}

// MathML element builders. Content must already be XML-safe.
function element(tag, attrs) {
    return function (content) { return "<" + tag + attrs + ">" + content + "</" + tag + ">"; };
}
var mo       = element("mo", "");
var mn       = element("mn", "");
var mi       = element("mi", ' mathvariant="italic"');
var miNormal = element("mi", ' mathvariant="normal"');

// One table for every non-letter, non-digit character.
// It also owns XML escaping: <, > and & only ever appear here, as entities,
// so anything that falls through to `mi` is already XML-safe.
var SYMBOLS = merge([

    // Operators, relations, fences and punctuation, emitted exactly as typed
    asTyped(mo, [
        "=", "+", "(", ")", "[", "]", "{", "}", "|",
        "!", "%", ":", ";", "?", "^", "~", "$",
        "\u00D7", // × multiplication
        "\u00F7", // ÷ division
        "\u2212", // − minus
        "\u22C5", // ⋅ dot operator
        "\u00B1", // ± plus-minus
        "\u2213", // ∓ minus-plus
        "\u2260", // ≠ not equal
        "\u2248", // ≈ approximately
        "\u2264", // ≤ less or equal
        "\u2265", // ≥ greater or equal
        "\u2261", // ≡ identical
        "\u221D", // ∝ proportional
        "\u221A", // √ square root
        "\u2211", // ∑ sum
        "\u220F", // ∏ product
        "\u222B", // ∫ integral
        "\u2202", // ∂ partial
        "\u2220", // ∠ angle
        "\u22A5", // ⊥ perpendicular
        "\u2225", // ∥ parallel
        "\u25B3", // △ triangle
        "\u00B0", // ° degree
        "\u2032", // ′ prime
        "\u2033", // ″ double prime
        "\u2192", // → right arrow
        "\u2190", // ← left arrow
        "\u21D2", // ⇒ implies
        "\u21D4", // ⇔ iff
        "\u2208", // ∈ element of
        "\u2209", // ∉ not element of
        "\u2282", // ⊂ subset
        "\u2286", // ⊆ subset or equal
        "\u222A", // ∪ union
        "\u2229", // ∩ intersection
        "\u2234", // ∴ therefore
        "\u2235", // ∵ because
        "\u2026", // … ellipsis
        "\u00A2", // ¢ cent
        "\u00A3", // £ pound
        "\u20AC"  // € euro
    ]),

    // Numeric punctuation and vulgar fractions
    asTyped(mn, [
        ",", ".",
        "\u00BD", // ½
        "\u2153", // ⅓
        "\u2154", // ⅔
        "\u00BC", // ¼
        "\u00BE", // ¾
        "\u2155", // ⅕
        "\u215B", // ⅛
        "\u215C", // ⅜
        "\u215D", // ⅝
        "\u215E"  // ⅞
    ]),

    // Upright identifiers
    asTyped(miNormal, [
        "\u221E", // ∞ infinity
        "\u2205"  // ∅ empty set
    ]),

    // Plain-text stand-ins rewritten to proper math characters
    {
        "-":      mo("\u2212"), // hyphen        → − minus
        "\u2013": mo("\u2212"), // – en dash     → − minus
        "*":      mo("\u22C5"), // asterisk      → ⋅ dot operator
        "\u00B7": mo("\u22C5"), // · middle dot  → ⋅ dot operator
        "/":      mo("\u00F7"), // slash         → ÷ division
        "'":      mo("\u2032"), // '             → ′ prime (feet, minutes)
        "\u2019": mo("\u2032"), // ’ smart quote → ′ prime
        "\"":     mo("\u2033"), // "             → ″ double prime (inches, seconds)
        "\u201D": mo("\u2033"), // ” smart quote → ″ double prime
        "<":      mo("&lt;"),
        ">":      mo("&gt;"),
        "&":      mo("&amp;")
    }
]);

function isDigit(c)      { return /^[0-9]$/.test(c); }
function isWhitespace(c) { return /^\s$/.test(c); }

function charToMathML(c) {
    if (SYMBOLS.hasOwnProperty(c)) return SYMBOLS[c];
    if (isDigit(c)) return mn(c);
    return mi(c);
}

function textToMathML(text) {
    var chars = filter(text.split(""), function (c) { return !isWhitespace(c); });
    return ["<math>"].concat(map(chars, charToMathML), ["</math>"]).join("\n");
}

// ---------------------------------------------------------------------------
// IO part: selection in, MathML object out
// ---------------------------------------------------------------------------

var TEXT_TYPES = ["Text", "Character", "Word", "Line", "Paragraph", "TextStyleRange", "TextColumn"];

function isTextSelection(sel) {
    if (!sel) return false;
    var name = sel.constructor.name;
    return filter(TEXT_TYPES, function (t) { return t === name; }).length > 0
        && sel.contents !== "";
}

function selectedText() {
    var sel = app.selection.length === 1 ? app.selection[0] : null;
    if (!isTextSelection(sel)) throw new Error("Select some text first.");
    return sel;
}

function replaceWithMathML(text, mml) {
    var doc   = app.activeDocument;
    var story = text.parentStory;
    var index = text.insertionPoints[0].index;
    var frame = text.parentTextFrames[0];
    if (!frame) throw new Error("The selected text is overset.");

    var page       = frame.parentPage || doc.pages[0];
    var mathObject = doc.createFromMathML(mml, page, frame.itemLayer, [0, 0]);
    mathObject.appliedMathMLFontSize = MATH_FONT_SIZE;

    text.remove();
    mathObject.parent.anchoredObjectSettings.insertAnchoredObject(
        story.insertionPoints[index],
        AnchorPosition.INLINE_POSITION
    );
}

function main() {
    var text = selectedText();
    replaceWithMathML(text, textToMathML(text.contents));
}

try {
    if (parseInt(app.version, 10) < 20) throw new Error("Requires InDesign 2025 (v20) or later.");
    app.doScript(main, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "Text to MathML");
} catch (e) {
    alert(e.message);
}
