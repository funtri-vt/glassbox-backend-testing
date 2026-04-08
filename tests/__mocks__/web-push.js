// 🛡️ Edge-Safe Mock for web-push
// This intercepts the import during testing so Miniflare doesn't crash 
// looking for the node:https native module.

export default {
    // Mimic the setup function
    setVapidDetails: (subject, publicKey, privateKey) => {
        // Do nothing in tests
    },
    
    // Mimic a successful push notification dispatch
    sendNotification: async (subscription, payload) => {
        return { statusCode: 201 }; 
    }
};