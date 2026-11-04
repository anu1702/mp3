// Load required packages
var mongoose = require('mongoose');

// Define our user schema
var UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    pendingTasks: {
        type: [String],
        default: function () {
            return [];
        }
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
UserSchema.pre('save', function () {
    if (this.isNew) {
        this.dateCreated = new Date();
    }
});

// Export the Mongoose model
module.exports = mongoose.model('User', UserSchema);
