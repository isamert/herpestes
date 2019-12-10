const mongoose = require("mongoose")
const express = require("express")
const _ = require("./utils")

// TODO: define user roles and add configuration
// ex. userRoles: ["admin", "normal"]
//     userRole: (req) => return req....
//     putRules: {"admin": "", "normal": "-password -email"}
//     => email and password putting are disabled for normal

// TODO: add DELETE for all()
// TODO: CRUD for subdocuments
// TODO: subdocumentrules trough herpestes.crud({..., subdocRules: {"subDocPathName": {properties to override parent rules}}})
// TODO: automatically create all endpoints using model name

const mkModel = (model) => _.isstr(model) ? mongoose.model(model) : model
const mkModelParam = (model) => `id_${_.isstr(model) ? model : model.modelName}`
const getModelParam = (req, model) => req.params[mkModelParam(model)]

const defaultAnswer = (res, result) => {
    return res.json(result)
};

function CRUD(config) {
    this.cfg = config
    this.cfg.model = mkModel(config.model)
    this.cfg.$path$ = _.isNone(this.cfg.$path$) ? [] : this.cfg.$path$

    return this
}

CRUD.prototype.router = function () {
    const disabledOps = _.arrcfg(this.cfg.disabledOperations);

    const router = new express.Router();
    disabledOps.includes('all') || router.get('/', this.all())
    disabledOps.includes('post') || router.post('/', this.post())

    if (this.cfg.routeSubdocuments) {
        this.cfg.model.schema.eachPath((pathname, schematype) => {
            if (schematype.$isMongooseArray
                && schematype.caster
                && schematype.caster.options.ref
                && schematype.casterConstructor.schemaName === "ObjectId") {

                const cfg = Object.assign({}, this.cfg)
                const parentModel = cfg.model;

                cfg.model = mkModel(schematype.caster.options.ref)
                cfg.attach = false

                router.param(mkModelParam(parentModel), async (req, res, next, parentId) => {
                    req.$path$ = pathname
                    req.$isSubdoc$ = true
                    req.$parent$ = await parentModel.findById(parentId)

                    next()
                })

                const subrouter = (new CRUD(cfg)).router()
                router.use(`/:${mkModelParam(parentModel)}/${pathname}`, subrouter)
            }
            // TODO: arraySubdocument
            // else if (schematype.$isArraySubdocument) {
            // ...
            // }
        })
    }

    const idParam = mkModelParam(this.cfg.model);
    router.use(`/:${idParam}`, this.findById())
    disabledOps.includes('get') || router.get(`/:${idParam}`, this.get())
    disabledOps.includes('put') || router.put(`/:${idParam}`, this.put())
    disabledOps.includes('patch') || router.patch(`/:${idParam}`, this.patch())
    disabledOps.includes('delete') || router.delete(`/:${idParam}`, this.delete())

    if (this.cfg.attach) {
        const endName = _.plural(this.cfg.model.modelName.toLowerCase());
        this.cfg.attach.use(`/${endName}`, router)
    }

    return router;
}

CRUD.prototype.all = function (config) {
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

        if (req.$isSubdoc$) {
            findObj._id = { $in: req.$parent$[req.$path$] }
        }

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
    const cfg = Object.assign(Object.assign({}, this.cfg), config)

    return async (req, res) => {
        cfg.answer(res, req.$item$);
    }
}

CRUD.prototype.findById = function (config) {
    const cfg = Object.assign(Object.assign({}, this.cfg), config)

    // FIXME: This may be called twice if there is a child route in the way: req.param(...) ^^
    // FIXME: populator populates everything in the path. intended or not?
    return async (req, res, next) => {
        let item = null
        let populator = _.arrjoin(req.query.populate)
        populator = populator ? populator : ""
        const idParam = getModelParam(req, cfg.model)
        if (!cfg.findBySlug || _.isObjectId(idParam)) {
            item = await cfg.model
                .findById(idParam)
                .populate(_.escapeRegExp(populator))
                .select(cfg.project)
        } else if (cfg.findBySlug)  {
            item = await cfg.model
                .findOne({ [cfg.findBySlug]: idParam })
                .populate(_.escapeRegExp(populator))
                .select(cfg.project)
        }

        if (!item) {
            return cfg.answer(res, cfg.notFoundResponse(req));
        }

        req.$item$ = item

        next()
    }
}

CRUD.prototype.post = function (config) {
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
            // TODO: isSubdoc
        } else {
            result = await cfg.model.create(mkItem(req.body))
            if (req.$isSubdoc$) {
                req.$parent$[req.$path$].push(result._id)
                await req.$parent$.save()
            }
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

CRUD.prototype.delete = function (config) {
    const cfg = Object.assign(Object.assign({}, this.cfg), config)

    return async (req, res) => {
        if (req.$isSubdoc$) {
            const idParam = getModelParam(req, cfg.model)
            req.$parent$[req.$path$].pull(idParam)

            await req.$parent$.save()
            await cfg.model.remove({ _id: idParam })

            return cfg.answer(res, { _id: idParam });
        }

        await req.$item$.remove();
        return cfg.answer(req, req.$item$);
    }
}

exports.crud = function ({
    model = null,
    answer = defaultAnswer,
    notFoundResponse = (req) => "not-found",
    findBySlug = "slug",
    project = "-__v",
    sortBy = null,
    searchFields,
    populate = "",
    disabledOperations = "",
    attach,
    routeSubdocuments = true
} = {}) {
    return new CRUD({
        model,
        answer,
        notFoundResponse,
        findBySlug,
        project,
        searchFields,
        sortBy,
        populate,
        disabledOperations,
        attach,
        routeSubdocuments
    })
};
