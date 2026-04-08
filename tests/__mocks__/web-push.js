// 🛡️ Edge-Safe Mock for web-push
// This intercepts the import during testing so Miniflare doesn't crash 
// looking for the node:https native module.

export default {
    // Mimic the setup function
    setVapidDetails: (subject, publicKey, privateKey) => {
        // Do nothing in tests
    },
    
    // Mimic a successful push notification dispatch, OR throw simulated errors
    // based on the endpoint URL to test our database cleanup logic.
    sendNotification: async (subscription, payload) => {
        if (subscription.endpoint.includes('invalid-push1')) {
            const err = new Error('Push subscription has unsubscribed or expired.');
            err.statusCode = 410; // Gone
            throw err;
        }
        
        if (subscription.endpoint.includes('invalid-push2')) {
            const err = new Error('Push subscription URL not found.');
            err.statusCode = 404; // Not Found
            throw err;
        }

        return { statusCode: 201 }; 
    }
};