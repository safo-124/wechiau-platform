// Defines the background sync task before the app itself starts, so Android
// can run it with the app closed (no screen is drawn for a background run).
import './src/sync/background';
import 'expo-router/entry';
