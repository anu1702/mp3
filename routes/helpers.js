function send(res, status, message, data) {
    res.status(status).json({
        message: message,
        data: data
    });
}

function asyncRoute(fn) {
    return function (req, res, next) {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

function isObjectId(value) {
    return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseObjectParam(raw, label) {
    if (raw === undefined) {
        return {};
    }
    if (typeof raw !== 'string') {
        return { error: label + ' must be a JSON object' };
    }
    var value;
    try {
        value = JSON.parse(raw);
    } catch (err) {
        return { error: label + ' must be valid JSON' };
    }
    if (!isPlainObject(value)) {
        return { error: label + ' must be a JSON object' };
    }
    return { value: value };
}

function parseNonNegativeInt(raw, label) {
    if (raw === undefined) {
        return {};
    }
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
        return { error: label + ' must be a non-negative integer' };
    }
    return { value: parseInt(raw, 10) };
}

function parseListQuery(query) {
    var where = parseObjectParam(query.where, 'where');
    if (where.error) {
        return where;
    }
    var sort = parseObjectParam(query.sort, 'sort');
    if (sort.error) {
        return sort;
    }
    var select = parseObjectParam(query.select, 'select');
    if (select.error) {
        return select;
    }
    var skip = parseNonNegativeInt(query.skip, 'skip');
    if (skip.error) {
        return skip;
    }
    var limit = parseNonNegativeInt(query.limit, 'limit');
    if (limit.error) {
        return limit;
    }
    if (query.count !== undefined && query.count !== 'true' && query.count !== 'false') {
        return { error: 'count must be true or false' };
    }
    return {
        where: where.value,
        sort: sort.value,
        select: select.value,
        skip: skip.value,
        limit: limit.value,
        count: query.count === 'true'
    };
}

function isQueryError(err) {
    if (!err) {
        return false;
    }
    if (err.name === 'CastError' || err.name === 'ValidationError') {
        return true;
    }
    var message = String(err.message || '');
    return message.indexOf('Projection') === 0;
}

function isDuplicateKey(err) {
    return err && (err.code === 11000 || err.code === 11001);
}

function bodyObject(body) {
    return isPlainObject(body);
}

async function listDocuments(Model, query, res, defaultLimit) {
    var parsed = parseListQuery(query);
    if (parsed.error) {
        return send(res, 400, parsed.error, null);
    }
    try {
        if (parsed.count) {
            var total = await Model.countDocuments(parsed.where || {});
            return send(res, 200, 'OK', total);
        }
        var finder = Model.find(parsed.where || {});
        if (parsed.sort) {
            finder = finder.sort(parsed.sort);
        }
        if (parsed.select) {
            finder = finder.select(parsed.select);
        }
        if (parsed.skip !== undefined) {
            finder = finder.skip(parsed.skip);
        }
        if (parsed.limit !== undefined) {
            finder = finder.limit(parsed.limit);
        } else if (defaultLimit !== undefined) {
            finder = finder.limit(defaultLimit);
        }
        var docs = await finder.exec();
        return send(res, 200, 'OK', docs);
    } catch (err) {
        if (isQueryError(err)) {
            return send(res, 400, 'Invalid query parameter', null);
        }
        console.error(err);
        return send(res, 500, 'Internal server error', null);
    }
}

async function getDocument(Model, id, query, res, notFoundMessage) {
    if (!isObjectId(id)) {
        return send(res, 404, notFoundMessage, null);
    }
    var select;
    if (query.select !== undefined) {
        var parsed = parseObjectParam(query.select, 'select');
        if (parsed.error) {
            return send(res, 400, parsed.error, null);
        }
        select = parsed.value;
    }
    try {
        var finder = Model.findById(id);
        if (select) {
            finder = finder.select(select);
        }
        var doc = await finder.exec();
        if (!doc) {
            return send(res, 404, notFoundMessage, null);
        }
        return send(res, 200, 'OK', doc);
    } catch (err) {
        if (isQueryError(err)) {
            return send(res, 400, 'Invalid select parameter', null);
        }
        console.error(err);
        return send(res, 500, 'Internal server error', null);
    }
}

function serverError(res, err) {
    console.error(err);
    return send(res, 500, 'Internal server error', null);
}

module.exports = {
    send: send,
    asyncRoute: asyncRoute,
    isObjectId: isObjectId,
    parseListQuery: parseListQuery,
    isDuplicateKey: isDuplicateKey,
    bodyObject: bodyObject,
    listDocuments: listDocuments,
    getDocument: getDocument,
    serverError: serverError
};
