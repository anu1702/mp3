var User = require('../models/user');
var Task = require('../models/task');
var helpers = require('./helpers');
var relations = require('./relations');

function readUserFields(body) {
    if (!helpers.bodyObject(body)) {
        return { status: 400, message: 'Request body must be a JSON object' };
    }
    if (typeof body.name !== 'string' || body.name.length === 0) {
        return { status: 400, message: 'Name is required and must be a non-empty string' };
    }
    if (typeof body.email !== 'string' || body.email.length === 0) {
        return { status: 400, message: 'Email is required and must be a non-empty string' };
    }
    var pendingTasks = body.pendingTasks;
    if (pendingTasks === undefined) {
        pendingTasks = [];
    }
    if (!Array.isArray(pendingTasks)) {
        return { status: 400, message: 'pendingTasks must be a list of task ids' };
    }
    for (var i = 0; i < pendingTasks.length; i++) {
        if (!helpers.isObjectId(pendingTasks[i])) {
            return { status: 400, message: 'pendingTasks must contain valid task ids' };
        }
    }
    return {
        fields: {
            name: body.name,
            email: body.email,
            pendingTasks: pendingTasks
        }
    };
}

async function emailTaken(email, exceptId) {
    var filter = { email: email };
    if (exceptId) {
        filter._id = { $ne: exceptId };
    }
    var existing = await User.findOne(filter).select('_id');
    return existing !== null;
}

async function checkPendingTasks(ids) {
    if (ids.length === 0) {
        return {};
    }
    var unique = [];
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
        if (!seen[ids[i]]) {
            seen[ids[i]] = true;
            unique.push(ids[i]);
        }
    }
    var tasks = await Task.find({ _id: { $in: unique } }).select('_id completed');
    if (tasks.length !== unique.length) {
        return { status: 404, message: 'One or more tasks in pendingTasks do not exist' };
    }
    for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].completed) {
            return { status: 400, message: 'pendingTasks cannot include a completed task' };
        }
    }
    return {};
}

async function listUsers(req, res) {
    return helpers.listDocuments(User, req.query, res);
}

async function createUser(req, res) {
    var parsed = readUserFields(req.body);
    if (parsed.status) {
        return helpers.send(res, parsed.status, parsed.message, null);
    }
    if (await emailTaken(parsed.fields.email)) {
        return helpers.send(res, 400, 'A user with this email already exists', null);
    }
    var pending = await checkPendingTasks(parsed.fields.pendingTasks);
    if (pending.status) {
        return helpers.send(res, pending.status, pending.message, null);
    }
    var user;
    try {
        user = await User.create({
            name: parsed.fields.name,
            email: parsed.fields.email,
            pendingTasks: parsed.fields.pendingTasks
        });
        await relations.syncUserTasks(user._id, user.name, [], user.pendingTasks);
        return helpers.send(res, 201, 'User created', user);
    } catch (err) {
        if (user && !helpers.isDuplicateKey(err)) {
            await User.deleteOne({ _id: user._id });
        }
        if (helpers.isDuplicateKey(err)) {
            return helpers.send(res, 400, 'A user with this email already exists', null);
        }
        return helpers.serverError(res, err);
    }
}

async function getUser(req, res) {
    return helpers.getDocument(User, req.params.id, req.query, res, 'User not found');
}

async function replaceUser(req, res) {
    if (!helpers.isObjectId(req.params.id)) {
        return helpers.send(res, 404, 'User not found', null);
    }
    var user = await User.findById(req.params.id);
    if (!user) {
        return helpers.send(res, 404, 'User not found', null);
    }
    var parsed = readUserFields(req.body);
    if (parsed.status) {
        return helpers.send(res, parsed.status, parsed.message, null);
    }
    if (await emailTaken(parsed.fields.email, user._id)) {
        return helpers.send(res, 400, 'A user with this email already exists', null);
    }
    var pending = await checkPendingTasks(parsed.fields.pendingTasks);
    if (pending.status) {
        return helpers.send(res, pending.status, pending.message, null);
    }
    var oldPending = user.pendingTasks.slice();
    try {
        await relations.syncUserTasks(user._id, parsed.fields.name, oldPending, parsed.fields.pendingTasks);
        user.name = parsed.fields.name;
        user.email = parsed.fields.email;
        user.pendingTasks = parsed.fields.pendingTasks;
        await user.save();
        return helpers.send(res, 200, 'User updated', user);
    } catch (err) {
        if (helpers.isDuplicateKey(err)) {
            return helpers.send(res, 400, 'A user with this email already exists', null);
        }
        return helpers.serverError(res, err);
    }
}

async function deleteUser(req, res) {
    if (!helpers.isObjectId(req.params.id)) {
        return helpers.send(res, 404, 'User not found', null);
    }
    var user = await User.findById(req.params.id).select('_id');
    if (!user) {
        return helpers.send(res, 404, 'User not found', null);
    }
    try {
        await relations.unassignUserTasks(user._id);
        await User.deleteOne({ _id: user._id });
        return res.status(204).end();
    } catch (err) {
        return helpers.serverError(res, err);
    }
}

module.exports = function (router) {
    router.route('/users')
        .get(helpers.asyncRoute(listUsers))
        .post(helpers.asyncRoute(createUser));

    router.route('/users/:id')
        .get(helpers.asyncRoute(getUser))
        .put(helpers.asyncRoute(replaceUser))
        .delete(helpers.asyncRoute(deleteUser));
};
