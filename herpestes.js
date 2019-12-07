const mongoose = require("mongoose")
const _ = require("./utils")

// TODO: define user roles and add configuration
// ex. userRoles: ["admin", "normal"]
//     userRole: (req) => return req....
//     putRules: {"admin": "", "normal": "-password -email"}
//     => email and password putting are disabled for normal

// TODO: CRUD for subdocuments
// TODO: automatically create all endpoints using model name

const defaultAnswer = (res, result) => {
    return res.json(result)
};

function CRUD(config) {
    this.cfg = config
    this.cfg.model = _.isstr(config.model) ? mongoose.model(config.model) : config.model
    this.cfg.itemName = `__${this.cfg.model.modelName.toLowerCase()}`;

    return this
}

CRUD.prototype.all = function (config) {
    // Override settings for GET
    const cfg = Object.assign(Object.assign({}, this.cfg), config)

    return async (req, res) => {
        const limit = parseInt(_.or(req.query.limit, 50), 10),
              afterId = req.query.after_id,
              sortBy = _.or(req.query.sort_by, _.or(cfg.sortBy, "_id")),
              searchTerm = req.query.search_term,
              populateQuery = _.arrjoin(req.query.populate)

        const findObj = {};

        // For every field in searchFields, make a regexp search
        if (searchTerm) {
            findObj.$or = [];
            cfg.searchFields.split(" ").forEach((term) => {
                const item = {};
                item[term] = new RegExp(_.escapeRegExp(searchTerm), "ui");
                findObj.$or.push(item);
            });
        }

        // Sort and paginate according to afterId and sortBy
        if (afterId) {
            const afterIdObject = await cfg.model.findById(afterId)
            const sortField = _.ltrim(sortBy, "-") // get sort field name, -priority -> priority

            findObj[sortField] = { $gt: afterIdObject[sortField] }
        }

        // Add other filtering options to query
        const reservedQueryKeywords = ["limit",
                                       "after_id",
                                       "sort_by",
                                       "search_term",
                                       "populate"]

        const opers = ["lte", "gte", "gt", "lt", "exists", "in"]

        Object.keys(req.query)
            .filter(key => !reservedQueryKeywords.includes(key))
            .forEach(key => {
                // Don't let queries like $set
                const param = _.ltrim(key, "[^\\w]")
                const val = req.query[key]

                // FIXME: arrays are not working as expected
                // ...?...&a=1&a=2&a=3 => returns a: [1,2,3]
                // But this does not handle that properly
                // But I believe there is no need to handle arrays

                if (Object.keys(val).every(x => opers.includes(x))) { // handle age[gte] kinda stuff
                    Object.keys(val)
                        .forEach(oper => {
                            let operValue = val[oper]
                            try {operValue = JSON.parse(operValue);} catch (ex) {}

                            findObj[param] = {}
                            findObj[param]["$" + oper] = operValue
                        });
                } else if (Object.keys(cfg.model.schema.paths)
                           .some(x => param === x || param.startsWith(`${x}.`))) {
                    if (val.startsWith("~")) {
                        // Convert inputs starting with ~ to regex contain calls
                        const rx = _.escapeRegExp(_.ltrim(val, "~"));
                        findObj[param] = new RegExp(rx, "ui");
                    } else {
                        // TODO: might need type casting here
                        // val is always string and param might have
                        // different type. But mongoose might be handling it
                        // Dunno.
                        findObj[param] = val;
                    }
                }
            });

        const populators
              = _.escapeRegExp(`${_.or(cfg.populate, "")} `
                               + `${_.or(populateQuery, "")}`)
              .trim();

        let query = cfg.model
            .find(findObj)
            .limit(limit)
            .sort(sortBy)
            .select(cfg.project);

        if (populators) {
            query = query.populate(populators);
        }

        const items = await query.lean();
        cfg.answer(res, items);
    }
}

CRUD.prototype.get = function (config) {
    // Override settings for GET
    const cfg = Object.assign(Object.assign({}, this.cfg), config)

    return async (req, res) => {
        cfg.answer(res, req[cfg.itemName]);
    }
}

CRUD.prototype.findById = function (config) {
    const cfg = Object.assign(Object.assign({}, this.cfg), config)

    return async (req, res, next) => {
        let item = null;
        let populator = _.arrjoin(req.query.populate);
        populator = populator ? populator : "";
        if (cfg.findBySlug || _.isObjectId(req.params.id)) {
            item = await cfg.model
                .findById(req.params.id)
                .populate(_.escapeRegExp(populator))
                .select(cfg.project);
        } else if (cfg.findBySlug)  {
            item = await cfg.model
                .findOne({ [cfg.findBySlug]: req.params.id })
                .populate(_.escapeRegExp(populator))
                .select(cfg.project);
        }

        if (!item) {
            return cfg.answer(res, cfg.notFoundResponse(req));
        }

        req[cfg.itemName] = item;
        next();
    }
}

CRUD.prototype.post = function (config) {
    // FIXME: this does not check subdocuments, also check other
    // exports.route.... functions:
    // Create the object using only the paths that are available in the schema
    // and discard rest of the request body
    const cfg = Object.assign(Object.assign({}, this.cfg), config)

    const mkItem = (body) => {
        const item = {}
        const predefinedKeys = Object.keys(cfg.model.schema.paths)
        Object.keys(_.clearEmpty(body))
            .filter(param => predefinedKeys.includes(param))
            .forEach(param => {
                item[param] = body[param]
            })
        return item
    }

    return async (req, res) => {
        let result;
        if (Array.isArray(req.body)) {
            result = await cfg.model.create(req.body.map(x => mkItem(x)))
        } else {
            result = await cfg.model.create(mkItem(req.body))
        }

        return cfg.answer(res, result)
    }
}

CRUD.prototype.put = function () {
    return () => { throw new Error("not-implemented") }
}

CRUD.prototype.patch = function () {
    return () => { throw new Error("not-implemented") }
}

CRUD.prototype.delete = function () {
    return async (req, res) => {
        await req[cfg.itemName].remove();
        return req[cfg.itemName];
    }
}

exports.crud = ({
    model = null,
    answer = defaultAnswer,
    notFoundResponse = (req) => "not-found",
    findBySlug = "slug",
    project = "-__v",
    sortBy = null,
    searchFields,
    populate = "",
} = {}) => {
    const config = {
        model,
        answer,
        notFoundResponse,
        findBySlug,
        project,
        searchFields,
        sortBy,
        populate
    }

    return new CRUD(config)
};
