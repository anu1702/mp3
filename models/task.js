// Load required packages
var mongoose = require('mongoose');

// Define our task schema
var TaskSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    deadline: {
        type: Date,
        required: true
    },
    completed: {
        type: Boolean,
        default: false
    },
    assignedUser: {
        type: String,
        default: ''
    },
    assignedUserName: {
        type: String,
        default: 'unassigned'
    },
    dateCreated: {
        type: Date,
        default: Date.now,
        immutable: true
    }
}, {
    versionKey: false
});

// The server sets dateCreated. A value sent by the client is ignored,
// and immutable keeps the field unchanged on later updates.
TaskSchema.pre('save', function () {
    if (this.isNew) {
        this.dateCreated = new Date();
    }
});

// Export the Mongoose model
module.exports = mongoose.model('Task', TaskSchema);
