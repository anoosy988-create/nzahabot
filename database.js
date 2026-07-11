// MTX Bot - MongoDB Database Layer (Ticket System Only)

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('[MTX DB] ERROR: MONGODB_URI is not set!');
    process.exit(1);
}

// Auto-fix: remove port number from SRV URI if present
if (MONGODB_URI && MONGODB_URI.includes('.mongodb.net:')) {
    MONGODB_URI = MONGODB_URI.replace(/\.mongodb\.net:\d+/, '.mongodb.net');
    console.log('[MTX DB] Auto-fixed URI: removed port number');
}

if (MONGODB_URI.includes('<db_password>')) {
    console.error('[MTX DB] ERROR: Replace <db_password> with your actual password!');
    process.exit(1);
}

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            retryWrites: true,
            w: 'majority'
        });
        console.log('[MTX DB] Connected to MongoDB Atlas successfully');
    } catch (err) {
        console.error('[MTX DB] Connection failed:', err.message);
        if (err.message.includes('bad auth')) {
            console.error('[MTX DB] Authentication failed - wrong password!');
        }
        process.exit(1);
    }
}

connectDB();

mongoose.connection.on('error', (err) => {
    console.error('[MTX DB] Error:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.warn('[MTX DB] Disconnected, reconnecting...');
});

mongoose.connection.on('reconnected', () => {
    console.log('[MTX DB] Reconnected');
});

// ─────────────────────────────────────────────────────────────
// Guild Config Schema
// ─────────────────────────────────────────────────────────────

const configSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    ticketCategoryId: { type: String, default: null },
    ticketLogsId: { type: String, default: null },
    ticketRoleId: { type: String, default: null },
    ticketOptions: [{ label: String, value: String }],
    ticketCounter: { type: Number, default: 0 }
});

const GuildConfig = mongoose.model('GuildConfig', configSchema);

// ─────────────────────────────────────────────────────────────
// Ticket Schema
// ─────────────────────────────────────────────────────────────

const ticketSchema = new mongoose.Schema({
    channelId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true, index: true },
    number: { type: Number, required: true },
    ownerId: { type: String, required: true },
    claimedBy: { type: String, default: null },
    label: { type: String, default: '' },
    addedUsers: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});

ticketSchema.index({ guildId: 1, ownerId: 1 });
const Ticket = mongoose.model('Ticket', ticketSchema);

// ─────────────────────────────────────────────────────────────
// Config Database
// ─────────────────────────────────────────────────────────────

class ConfigDB {
    async get(guildId) {
        return await GuildConfig.findOne({ guildId }).lean();
    }

    async setTicketConfig(guildId, { logsId, categoryId, roleId }) {
        await GuildConfig.findOneAndUpdate(
            { guildId },
            { $set: { ticketLogsId: logsId, ticketCategoryId: categoryId, ticketRoleId: roleId } },
            { upsert: true }
        );
    }

    async getTicketConfig(guildId) {
        const doc = await GuildConfig.findOne({ guildId }).lean();
        if (!doc) return null;
        return {
            logsId: doc.ticketLogsId,
            categoryId: doc.ticketCategoryId,
            roleId: doc.ticketRoleId,
            ticketOptions: doc.ticketOptions || []
        };
    }

    async addTicketOption(guildId, label, value) {
        await GuildConfig.findOneAndUpdate(
            { guildId },
            { $push: { ticketOptions: { label, value } } },
            { upsert: true }
        );
    }

    async removeTicketOption(guildId, value) {
        await GuildConfig.findOneAndUpdate(
            { guildId },
            { $pull: { ticketOptions: { value } } }
        );
    }

    async getTicketCounter(guildId) {
        const doc = await GuildConfig.findOne({ guildId }).lean();
        return doc?.ticketCounter || 0;
    }

    async incrementTicketCounter(guildId) {
        const doc = await GuildConfig.findOneAndUpdate(
            { guildId },
            { $inc: { ticketCounter: 1 } },
            { upsert: true, new: true }
        );
        return doc.ticketCounter;
    }
}

// ─────────────────────────────────────────────────────────────
// Ticket Database
// ─────────────────────────────────────────────────────────────

class TicketDB {
    async getAll() {
        const docs = await Ticket.find().lean();
        const map = new Map();
        docs.forEach(d => {
            map.set(d.channelId, {
                g: d.guildId,
                num: d.number,
                owner: d.ownerId,
                claimed: d.claimedBy,
                label: d.label,
                users: d.addedUsers
            });
        });
        return map;
    }

    async get(channelId) {
        const doc = await Ticket.findOne({ channelId }).lean();
        if (!doc) return null;
        return {
            g: doc.guildId,
            num: doc.number,
            owner: doc.ownerId,
            claimed: doc.claimedBy,
            label: doc.label,
            users: doc.addedUsers
        };
    }

    async create(channelId, guildId, number, ownerId, label) {
        await Ticket.create({
            channelId,
            guildId,
            number,
            ownerId,
            label,
            addedUsers: [ownerId]
        });
    }

    async update(channelId, updates) {
        const setObj = {};
        if (updates.claimed !== undefined) setObj.claimedBy = updates.claimed;
        if (updates.label !== undefined) setObj.label = updates.label;
        await Ticket.findOneAndUpdate({ channelId }, { $set: setObj });
    }

    async addUser(channelId, userId) {
        await Ticket.findOneAndUpdate(
            { channelId },
            { $addToSet: { addedUsers: userId } }
        );
    }

    async delete(channelId) {
        await Ticket.deleteOne({ channelId });
    }

    async getCounters() {
        const docs = await GuildConfig.find().lean();
        const counters = {};
        docs.forEach(d => {
            if (d.ticketCounter) counters[d.guildId] = d.ticketCounter;
        });
        return counters;
    }
}

module.exports = {
    ConfigDB: new ConfigDB(),
    TicketDB: new TicketDB()
};
