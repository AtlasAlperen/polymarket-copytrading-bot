import { ENV } from '../config/env';
import { UserActivityInterface } from '../interfaces/User';
import fetchData from '../utils/fetchData';

const USER_ADDRESS = ENV.USER_ADDRESS;
const TOO_OLD_TIMESTAMP = ENV.TOO_OLD_TIMESTAMP;
const FETCH_INTERVAL = ENV.FETCH_INTERVAL;

if (!USER_ADDRESS) {
    throw new Error('USER_ADDRESS is not defined');
    console.log('USER_ADDRESS is not defined');
}

// In-memory storage for processed trades
const processedTrades = new Set<string>();
export const pendingTrades: UserActivityInterface[] = [];

const fetchTradeData = async () => {
    try {
        // Fetch user activities from Polymarket API
        const activities_raw = await fetchData(
            `https://data-api.polymarket.com/activities?user=${USER_ADDRESS}`
        );

        // Validate API response is an array
        if (!Array.isArray(activities_raw)) {
            if (activities_raw === null || activities_raw === undefined) {
                // Network error or empty response - already handled by fetchData
                return;
            }
            console.warn('API returned non-array response, skipping...');
            return;
        }
        
        if (activities_raw.length === 0) {
            return;
        }
        
        const activities: UserActivityInterface[] = activities_raw;

        // Filter for TRADE type activities only
        const trades = activities.filter((activity) => activity.type === 'TRADE');

        // Calculate cutoff timestamp (too old trades) - hours ago in milliseconds
        const cutoffTimestamp = Date.now() - TOO_OLD_TIMESTAMP * 60 * 60 * 1000;

        // Filter new trades that aren't too old
        const newTrades = trades.filter((trade: UserActivityInterface) => {
            const isNew = !processedTrades.has(trade.transactionHash);
            const isRecent = trade.timestamp >= cutoffTimestamp;
            return isNew && isRecent;
        });

        if (newTrades.length > 0) {
            console.log(`Found ${newTrades.length} new trade(s) to process`);
            
            // Add new trades to pending queue
            for (const trade of newTrades) {
                const activityData: UserActivityInterface = {
                    ...trade,
                    proxyWallet: USER_ADDRESS,
                    bot: false,
                    botExcutedTime: 0,
                };
                pendingTrades.push(activityData);
                processedTrades.add(trade.transactionHash);
                console.log(`Queued new trade: ${trade.transactionHash}`);
            }
        }
    } catch (error) {
        console.error('Error fetching trade data:', error);
    }
};

const tradeMonitor = async () => {
    console.log('Trade Monitor is running every', FETCH_INTERVAL, 'seconds');
    while (true) {
        await fetchTradeData();
        await new Promise((resolve) => setTimeout(resolve, FETCH_INTERVAL * 1000));
    }
};

export default tradeMonitor;
