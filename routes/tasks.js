var Task = require('../models/task');
var User = require('../models/user');
var helpers = require('./helpers');
var relations = require('./relations');

function readTaskFields(body) {
    if (!helpers.bodyObject(body)) {
        return { status: 400, message: 'Request body must be a JSON object' };
    }
    if (typeof body.name !== 'string' || body.name.length === 0) {
        return { status: 400, message: 'Name is required and must be a non-empty string' };
    }
    if (typeof body.deadline !== 'string' || body.deadline.length === 0 || Number.isNaN(Date.parse(body.deadline))) {
        return { status: 400, message: 'Deadline is required and must be a valid date' };
    }
    if (body.description !== undefined && typeof body.description !== 'string') {
        return { status: 400, message: 'Description must be a string' };
    }
    if (body.completed !== undefined && typeof body.completed !== 'boolean') {
        return { status: 400, message: 'Completed must be a boolean' };
    }
    var assignedUser = body.assignedUser === undefined ? '' : body.assignedUser;
    if (typeof assignedUser !== 'string') {
        return { status: 400, message: 'assignedUser must be a string' };
    }
    if (assignedUser !== '' && !helpers.isObjectId(assignedUser)) {
        return { status: 400, message: 'assignedUser must be a valid user id' };
    }
    if (body.assignedUserName !== undefined && typeof body.assignedUserName !== 'string') {
        return { status: 400, message: 'assignedUserName must be a string' };
    }
    if (assignedUser === '' && body.assignedUserName !== undefined && body.assignedUserName !== 'unassigned') {
        return { status: 400, message: 'assignedUserName does not match the assigned user' };
    }
    return {
        fields: {
            name: body.name,
            description: body.description === undefined ? '' : body.description,
            deadline: new Date(body.deadline),
            completed: body.completed === undefined ? false : body.completed,
            assignedUser: assignedUser,
            assignedUserName: body.assignedUserName
        }
    };
}

async function resolveAssignee(fields) {
    if (fields.assignedUser === '') {
        return {
            assignedUser: '',
            assignedUserName: 'unassigned'
        };
    }
    var user = await User.findById(fields.assignedUser).select('_id name');
    if (!user) {
        return { status: 404, message: 'Assigned user not found' };
    }
    if (fields.assignedUserName !== undefined && fields.assignedUserName !== user.name) {
        return { status: 400, message: 'assignedUserName does not match the assigned user' };
    }
    return {
        assignedUser: String(user._id),
        assignedUserName: user.name
    };
}

function applyTaskFields(task, fields, assignee) {
    task.name = fields.name;
    task.description = fields.description;
    task.deadline = fields.deadline;
    task.completed = fields.completed;
    task.assignedUser = assignee.assignedUser;
    task.assignedUserName = assignee.assignedUserName;
}

async function listTasks(req, res) {
    return helpers.listDocuments(Task, req.query, res, 100);
}

async function createTask(req, res) {
    var parsed = readTaskFields(req.body);
    if (parsed.status) {
        return helpers.send(res, parsed.status, parsed.message, null);
    }
    var assignee = await resolveAssignee(parsed.fields);
    if (assignee.status) {
        return helpers.send(res, assignee.status, assignee.message, null);
    }
    try {
        var task = new Task();
        applyTaskFields(task, parsed.fields, assignee);
        await task.save();
        await relations.syncTaskAssignment('', assignee.assignedUser, task._id, task.completed);
        return helpers.send(res, 201, 'Task created', task);
    } catch (err) {
        return helpers.serverError(res, err);
    }
}

async function getTask(req, res) {
    return helpers.getDocument(Task, req.params.id, req.query, res, 'Task not found');
}

async function replaceTask(req, res) {
    if (!helpers.isObjectId(req.params.id)) {
        return helpers.send(res, 404, 'Task not found', null);
    }
    var task = await Task.findById(req.params.id);
    if (!task) {
        return helpers.send(res, 404, 'Task not found', null);
    }
    var parsed = readTaskFields(req.body);
    if (parsed.status) {
        return helpers.send(res, parsed.status, parsed.message, null);
    }
    var assignee = await resolveAssignee(parsed.fields);
    if (assignee.status) {
        return helpers.send(res, assignee.status, assignee.message, null);
    }
    var previousUserId = task.assignedUser || '';
    applyTaskFields(task, parsed.fields, assignee);
    try {
        await task.save();
        await relations.syncTaskAssignment(previousUserId, assignee.assignedUser, task._id, task.completed);
        return helpers.send(res, 200, 'Task updated', task);
    } catch (err) {
        return helpers.serverError(res, err);
    }
}

async function deleteTask(req, res) {
    if (!helpers.isObjectId(req.params.id)) {
        return helpers.send(res, 404, 'Task not found', null);
    }
    var task = await Task.findById(req.params.id).select('_id assignedUser');
    if (!task) {
        return helpers.send(res, 404, 'Task not found', null);
    }
    try {
        await relations.syncTaskAssignment(task.assignedUser, '', task._id, true);
        await Task.deleteOne({ _id: task._id });
        return res.status(204).end();
    } catch (err) {
        return helpers.serverError(res, err);
    }
}

module.exports = function (router) {
    router.route('/tasks')
        .get(helpers.asyncRoute(listTasks))
        .post(helpers.asyncRoute(createTask));

    router.route('/tasks/:id')
        .get(helpers.asyncRoute(getTask))
        .put(helpers.asyncRoute(replaceTask))
        .delete(helpers.asyncRoute(deleteTask));
};
