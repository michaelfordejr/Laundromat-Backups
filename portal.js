// Shared Portal Logic
const REPO_NAME = "Laundromat-Backups";

function getPortalApp() {
    return {
        token: localStorage.getItem('gh_token') || '',
        tempToken: '',
        user: null,
        data: { laundromats: [], machines: [], logs: [], spareParts: [], scheduledMaintenance: [], documents: [] },
        loading: false,
        isDirty: false,
        sha: '',
        deviceName: localStorage.getItem('device_name') || 'Office Portal',

        async initShared() {
            if (this.token) {
                if (await this.fetchUserInfo()) {
                    await this.fetchData();
                } else {
                    this.logout();
                }
            }
        },

        async login() {
            this.token = this.tempToken;
            if (await this.fetchUserInfo()) {
                localStorage.setItem('gh_token', this.token);
                location.reload();
            } else {
                alert('Invalid GitHub Token.');
                this.token = '';
            }
        },

        logout() {
            localStorage.removeItem('gh_token');
            location.href = 'index.html';
        },

        async fetchUserInfo() {
            try {
                const res = await fetch('https://api.github.com/user', {
                    headers: { 'Authorization': `token ${this.token}` }
                });
                if (res.ok) {
                    this.user = await res.json();
                    return true;
                }
            } catch (e) {}
            return false;
        },

        async fetchData() {
            this.loading = true;
            try {
                const res = await fetch(`https://api.github.com/repos/${this.user.login}/${REPO_NAME}/contents/data.json`, {
                    headers: { 'Authorization': `token ${this.token}`, 'Accept': 'application/vnd.github.v3+json' }
                });
                if (res.ok) {
                    const json = await res.json();
                    this.sha = json.sha;
                    const decoded = decodeURIComponent(escape(window.atob(json.content.replace(/\s/g, ''))));
                    this.data = JSON.parse(decoded);
                    this.isDirty = false;
                }
            } catch (e) {
                console.error(e);
            }
            this.loading = false;
        },

        async saveData() {
            this.loading = true;
            try {
                const jsonStr = JSON.stringify(this.data, null, 2);
                const content = window.btoa(unescape(encodeURIComponent(jsonStr)));
                const res = await fetch(`https://api.github.com/repos/${this.user.login}/${REPO_NAME}/contents/data.json`, {
                    method: 'PUT',
                    headers: { 'Authorization': `token ${this.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: `Portal Update from ${this.deviceName}`, content: content, sha: this.sha })
                });
                if (res.ok) {
                    const json = await res.json();
                    this.sha = json.content.sha;
                    this.isDirty = false;
                    alert('Synced to Cloud!');
                } else alert('Save conflict. Refresh first.');
            } catch (e) { alert('Error: ' + e.message); }
            this.loading = false;
        },

        // Helper functions
        formatDate(ts) {
            return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        },

        getMachineName(id) {
            const m = this.data.machines.find(m => m.id === id);
            return m ? (m.nickname || (m.brand + ' ' + m.model)) : 'Unknown';
        },

        getRepoOwner() {
            return this.user ? this.user.login : '';
        }
    };
}
