// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  📁 MTX Database System - JSON-based local storage                   ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const WARNINGS_FILE = path.join(DATA_DIR, 'warnings.json');
const PROTECTION_FILE = path.join(DATA_DIR, 'protection.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJSON(file, defaultValue = {}) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
    } catch (e) {
        console.error(`[MTX DB] Error loading ${file}:`, e.message);
    }
    return defaultValue;
}

function saveJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`[MTX DB] Error saving ${file}:`, e.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// ⚠️ Warning Database
// ═══════════════════════════════════════════════════════════════════════

class WarningDatabase {
    constructor() {
        this.data = loadJSON(WARNINGS_FILE, {});
    }

    _save() {
        saveJSON(WARNINGS_FILE, this.data);
    }

    _getKey(userId, guildId) {
        return `${guildId}_${userId}`;
    }

    getWarnings(userId, guildId) {
        const key = this._getKey(userId, guildId);
        return this.data[key] || [];
    }

    addWarning(userId, guildId, reason, moderator) {
        const key = this._getKey(userId, guildId);
        if (!this.data[key]) this.data[key] = [];

        this.data[key].push({
            reason: reason,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag,
            timestamp: Date.now()
        });

        this._save();
        return { total: this.data[key].length };
    }

    removeWarning(userId, guildId, index) {
        const key = this._getKey(userId, guildId);
        if (!this.data[key] || index < 0 || index >= this.data[key].length) return false;

        this.data[key].splice(index, 1);
        if (this.data[key].length === 0) delete this.data[key];
        this._save();
        return true;
    }

    clearWarnings(userId, guildId) {
        const key = this._getKey(userId, guildId);
        delete this.data[key];
        this._save();
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 🛡️ Protection Database
// ═══════════════════════════════════════════════════════════════════════

class ProtectionDatabase {
    constructor() {
        this.data = loadJSON(PROTECTION_FILE, {});
    }

    _save() {
        saveJSON(PROTECTION_FILE, this.data);
    }

    _getGuild(guildId) {
        if (!this.data[guildId]) {
            this.data[guildId] = {
                enabled: true,
                logChannel: null,
                protectedUsers: []
            };
        }
        return this.data[guildId];
    }

    isEnabled(guildId) {
        return this._getGuild(guildId).enabled;
    }

    setEnabled(guildId, enabled) {
        const guild = this._getGuild(guildId);
        guild.enabled = enabled;
        this._save();
    }

    getLogChannel(guildId) {
        return this._getGuild(guildId).logChannel;
    }

    setLogChannel(guildId, channelId) {
        const guild = this._getGuild(guildId);
        guild.logChannel = channelId;
        this._save();
    }

    isProtected(guildId, userId) {
        const guild = this._getGuild(guildId);
        return guild.protectedUsers.includes(userId);
    }

    addProtected(guildId, userId) {
        const guild = this._getGuild(guildId);
        if (!guild.protectedUsers.includes(userId)) {
            guild.protectedUsers.push(userId);
            this._save();
        }
    }

    removeProtected(guildId, userId) {
        const guild = this._getGuild(guildId);
        guild.protectedUsers = guild.protectedUsers.filter(id => id !== userId);
        this._save();
    }
}

module.exports = {
    WarningDB: new WarningDatabase(),
    ProtectionDB: new ProtectionDatabase()
};
