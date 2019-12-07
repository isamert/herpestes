const mongoose = require("mongoose")

/**
 * Check if given objects are undefined or null.
 */
exports.isNone = (...args) =>
    args.some(obj => typeof obj === "undefined" || obj === null);

/**
 * Check if given object/array is undefined, null or empty.
 */
exports.isEmpty = (...args) =>
    args.some(obj => exports.isNone(obj)
              || (Array.isArray(obj) && obj.length === 0)
              || (exports.isstr(obj) && obj.length === 0)
              || (typeof obj === "object"
                  && Object.keys(obj).length === 0
                  && obj.constructor === Object));

/**
 * Check if given object is a `string` or `String`.
*/
exports.isstr = (str) =>
    typeof str === "string" || str instanceof String;

exports.rtrim = (string, ws = "\\s") =>
    string.replace(new RegExp(`(${ws})*$`), "");

exports.ltrim = (string, ws = "\\s") =>
    string.replace(new RegExp(`^(${ws})*`), "");

exports.trim = (string, ws = "\\s") =>
    exports.rtrim(exports.ltrim(string, ws), ws);

/**
 * If an array is given as the `item`, join it using `s` and return it,
 * if not, simply return the `item` itself.
 * @param item array or string to join.
 * @param s seperator string.
*/
exports.arrjoin = (item, s = " ") => {
    if (Array.isArray(item)) {
        return item.join(s);
    }

    return item;
};

/**
 * Escape user input to be treated as a literal string within a
 * regular expression.
*/
exports.escapeRegExp = (string) =>
    string.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * Returns `val` if it is defined else returns `def`.
*/
exports.or = (val, def) => val === undefined || val === null ? def : val;

/**
 * Clear empty items from given object.
*/
exports.clearEmpty = (obj) => {
    const result = {...obj};
    Object.keys(result).forEach((key) => {
        if (exports.isEmpty(result[key])) {
            delete result[key];
        }
    });

    return result;
};

// ///////////////////////////////////////////////////////////////////
// Mongoose stuff
// ///////////////////////////////////////////////////////////////////

/**
 * Check if given string/object is an mongoose object ID.
 * Source: https://stackoverflow.com/a/29231016
*/
exports.isObjectId = (supposedId) => {
    let idObj = null;
    try {
        idObj = new mongoose.Types.ObjectId(supposedId);
    } catch (ex) {
        return false;
    }

    return idObj.toString() === supposedId;
};
