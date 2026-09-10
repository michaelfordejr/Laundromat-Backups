// Shared Portal Logic
const REPO_NAME = "Laundromat-Backups";

function getPortalApp() {
    return {
        token: localStorage.getItem('gh_token') || '',
        tempToken: '',
        user: null,
        data: { laundromats: [], machines: [], logs: [], spareParts: [], scheduledMaintenance: [], documents: [] },
        reports: [],
        loading: false,
        isDirty: false,
        sha: '',
        deviceName: localStorage.getItem('device_name') || 'Office Portal',
        searchQuery: '',
        searchResults: [],

        async initShared() {
            if (this.token) {
                if (await this.fetchUserInfo()) {
                    await this.fetchData();
                } else {
                    this.logout();
                }
            }
        },

        // Global Search
        performGlobalSearch() {
            if (!this.searchQuery) {
                this.searchResults = [];
                return;
            }
            const q = this.searchQuery.toLowerCase();
            this.searchResults = this.data.machines.filter(m =>
                (m.nickname && m.nickname.toLowerCase().includes(q)) ||
                (m.serialNumber && m.serialNumber.toLowerCase().includes(q)) ||
                (m.model && m.model.toLowerCase().includes(q)) ||
                (m.brand && m.brand.toLowerCase().includes(q))
            ).map(m => ({
                ...m,
                siteName: this.data.laundromats.find(s => s.id === m.laundromatId)?.name || 'Unknown'
            }));
        },

        // CSV Export
        downloadCsv(type) {
            let csv = '';
            let filename = '';

            if (type === 'inventory') {
                csv = 'Name,Part Number,Stock,Threshold\n';
                this.data.spareParts.forEach(p => {
                    csv += `"${p.name}","${p.partNumber}",${p.stockQuantity},${p.minimumThreshold}\n`;
                });
                filename = 'inventory_export.csv';
            } else if (type === 'logs') {
                csv = 'Date,Machine,Site,Action,Notes\n';
                this.data.logs.forEach(l => {
                    const m = this.getMachineById(l.machineId);
                    const site = this.data.laundromats.find(s => s.id === m?.laundromatId);
                    const date = this.formatDate(l.timestamp);
                    csv += `"${date}","${m?.nickname || m?.model}","${site?.name}","${l.action}","${l.notes.replace(/\n/g, ' ')}"\n`;
                });
                filename = 'service_history.csv';
            }

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        // Map Helpers
        getCoordinates(location) {
            const regex = /^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/;
            const match = location.match(regex);
            if (match) return [parseFloat(match[1]), parseFloat(match[3])];
            return null;
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

                // Fetch reports list
                await this.fetchReports();
            } catch (e) {
                console.error(e);
            }
            this.loading = false;
        },

        async fetchReports() {
            try {
                const res = await fetch(`https://api.github.com/repos/${this.user.login}/${REPO_NAME}/contents/reports`, {
                    headers: { 'Authorization': `token ${this.token}` }
                });
                if (res.ok) {
                    this.reports = await res.json();
                }
            } catch (e) {
                console.error("Failed to fetch reports", e);
            }
        },

        getReportUrl(report) {
            if (report.name.endsWith('.html')) {
                // Use GitHub Pages link if possible, otherwise raw with proxy
                return `https://${this.user.login}.github.io/${REPO_NAME}/reports/${report.name}`;
            }
            return report.download_url;
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

        async deleteReport(report) {
            if (!confirm(`Are you sure you want to delete ${report.name}?`)) return;
            this.loading = true;
            try {
                const res = await fetch(`https://api.github.com/repos/${this.user.login}/${REPO_NAME}/contents/${report.path}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `token ${this.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: `Deleted report: ${report.name}`,
                        sha: report.sha
                    })
                });
                if (res.ok) {
                    alert('Report deleted.');
                    await this.fetchReports();
                } else {
                    alert('Failed to delete report.');
                }
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
