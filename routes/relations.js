var User = require('../models/user');
var Task = require('../models/task');

function idList(ids) {
    var unique = [];
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
        var id = String(ids[i]);
        if (!seen[id]) {
            seen[id] = true;
            unique.push(id);
        }
    }
    return unique;
}

// After a user is created or replaced, make every task in the new pending list
// point at this user, unassign tasks that were removed, and refresh assignedUserName.
async function syncUserTasks(userId, newName, oldPending, newPending) {
    var userIdStr = String(userId);
    var oldIds = idList(oldPending || []);
    var newIds = idList(newPending || []);
    var newSet = {};
    for (var i = 0; i < newIds.length; i++) {
        newSet[newIds[i]] = true;
    }
    var toUnassign = [];
    for (var j = 0; j < oldIds.length; j++) {
        if (!newSet[oldIds[j]]) {
            toUnassign.push(oldIds[j]);
        }
    }

    var pulls = {};
    if (newIds.length > 0) {
        var tasks = await Task.find({ _id: { $in: newIds } }).select('_id assignedUser');
        for (var k = 0; k < tasks.length; k++) {
            var owner = tasks[k].assignedUser ? String(tasks[k].assignedUser) : '';
            if (owner && owner !== userIdStr) {
                if (!pulls[owner]) {
                    pulls[owner] = [];
                }
                pulls[owner].push(String(tasks[k]._id));
            }
        }
    }

    var owners = Object.keys(pulls);
    for (var n = 0; n < owners.length; n++) {
        await User.updateOne(
            { _id: owners[n] },
            { $pull: { pendingTasks: { $in: pulls[owners[n]] } } }
        );
    }

    if (toUnassign.length > 0) {
        await Task.updateMany(
            { _id: { $in: toUnassign } },
            { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
        );
    }
    if (newIds.length > 0) {
        await Task.updateMany(
            { _id: { $in: newIds } },
            { $set: { assignedUser: userIdStr, assignedUserName: newName } }
        );
    }
    await Task.updateMany(
        { assignedUser: userIdStr, _id: { $nin: newIds } },
        { $set: { assignedUserName: newName } }
    );
}

async function pullPending(userId, taskId) {
    if (!userId) {
        return;
    }
    await User.updateOne(
        { _id: userId },
        { $pull: { pendingTasks: String(taskId) } }
    );
}

async function addPending(userId, taskId) {
    if (!userId) {
        return;
    }
    await User.updateOne(
        { _id: userId },
        { $addToSet: { pendingTasks: String(taskId) } }
    );
}

// previousUserId is the task's assignee before this request. nextUserId is "" when unassigned.
async function syncTaskAssignment(previousUserId, nextUserId, taskId, completed) {
    var previous = previousUserId ? String(previousUserId) : '';
    var next = nextUserId ? String(nextUserId) : '';
    if (previous && previous !== next) {
        await pullPending(previous, taskId);
    }
    if (!next) {
        return;
    }
    if (completed) {
        await pullPending(next, taskId);
    } else {
        await addPending(next, taskId);
    }
}

async function unassignUserTasks(userId) {
    await Task.updateMany(
        { assignedUser: String(userId) },
        { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
    );
}

module.exports = {
    syncUserTasks: syncUserTasks,
    syncTaskAssignment: syncTaskAssignment,
    unassignUserTasks: unassignUserTasks
};
