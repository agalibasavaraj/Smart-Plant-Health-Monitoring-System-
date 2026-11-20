
import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { AnalysisResultDisplay } from './components/AnalysisResultDisplay';
import { DiseaseGuideDashboard } from './components/DiseaseGuideDashboard';
import { analyzePlantHealth } from './services/geminiService';
import { AnalysisResult, User, HistoricalAnalysis } from './types';
import { fileToBase64 } from './utils/fileUtils';
import { AuthPage } from './components/AuthPage';
import { AdminDashboard } from './components/AdminDashboard';
import { LocationProvider } from './contexts/LocationContext';

const DIAGNOSIS_HISTORY_KEY = 'plant_doctor_diagnosis_history';

// Mock user database in localStorage
const initializeMockUsers = () => {
    const existingUsers = JSON.parse(localStorage.getItem('plant_health_users') || '[]');
    const existingEmails = new Set(existingUsers.map((user: any) => user.email));

    const adminUser = {
        id: 'admin-001',
        email: 'admin@plant.health',
        password: 'admin123', // In a real app, this would be hashed
        role: 'admin',
    };

    const socialUsers = [
        {
            id: 'google-demo-001',
            email: 'google.user@plant.health',
            password: 'google123',
            role: 'user' as const,
        },
        {
            id: 'facebook-demo-001',
            email: 'facebook.user@plant.health',
            password: 'facebook123',
            role: 'user' as const,
        },
    ];

    if (!existingEmails.has(adminUser.email)) {
        existingUsers.unshift(adminUser);
    }

    socialUsers.forEach((user) => {
        if (!existingEmails.has(user.email)) {
            existingUsers.push(user);
        }
    });

    localStorage.setItem('plant_health_users', JSON.stringify(existingUsers));
};

initializeMockUsers();


const App: React.FC = () => {
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [historicalAnalyses, setHistoricalAnalyses] = useState<HistoricalAnalysis[]>([]);
    const [diagnosisHistory, setDiagnosisHistory] = useState<string[]>([]);
    const [authError, setAuthError] = useState<string | null>(null);

    useEffect(() => {
        // Check for logged-in user
        const loggedInUser = localStorage.getItem('plant_health_currentUser');
        if (loggedInUser) {
            setCurrentUser(JSON.parse(loggedInUser));
        }
        // Load historical analyses
        const storedAnalyses = localStorage.getItem('plant_health_analyses');
        if(storedAnalyses) {
            setHistoricalAnalyses(JSON.parse(storedAnalyses));
        }

        const storedHistory = localStorage.getItem(DIAGNOSIS_HISTORY_KEY);
        if (storedHistory) {
            setDiagnosisHistory(JSON.parse(storedHistory));
        }
    }, []);


    const handleImageSelect = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result as string);
            setAnalysisResult(null);
            setError(null);
        };
        reader.readAsDataURL(file);
    }, []);

    const handleAnalyzeClick = useCallback(async () => {
        if (!imagePreview || !currentUser) {
            setError("Please select an image first.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setAnalysisResult(null);

        try {
            const base64Image = await fileToBase64(imagePreview);
            const mimeType = imagePreview.substring(imagePreview.indexOf(":") + 1, imagePreview.indexOf(";"));
            const result = await analyzePlantHealth(base64Image, mimeType);
            setAnalysisResult(result);

            // Save analysis to history
            const newAnalysis: HistoricalAnalysis = {
                id: `analysis-${Date.now()}`,
                userEmail: currentUser.email,
                analysis: result,
                timestamp: new Date().toISOString(),
                imageUrl: imagePreview,
            };
            
            const updatedAnalyses = [newAnalysis, ...historicalAnalyses];
            setHistoricalAnalyses(updatedAnalyses);
            localStorage.setItem('plant_health_analyses', JSON.stringify(updatedAnalyses));

            const nextHistory = [result.disease_name, ...diagnosisHistory].filter(Boolean).slice(0, 3);
            setDiagnosisHistory(nextHistory);
            localStorage.setItem(DIAGNOSIS_HISTORY_KEY, JSON.stringify(nextHistory));

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "An unknown error occurred during analysis.");
        } finally {
            setIsLoading(false);
        }
    }, [imagePreview, currentUser, historicalAnalyses]);

    const handleLogin = useCallback((email: string, password: string) => {
        setAuthError(null);
        const users = JSON.parse(localStorage.getItem('plant_health_users') || '[]');
        const user = users.find((u: any) => u.email === email && u.password === password);
        if (user) {
            const userData: User = { id: user.id, email: user.email, role: user.role };
            setCurrentUser(userData);
            localStorage.setItem('plant_health_currentUser', JSON.stringify(userData));
        } else {
            setAuthError("Invalid email or password.");
        }
    }, []);

    const handleRegister = useCallback((email: string, password: string) => {
        setAuthError(null);
        const users = JSON.parse(localStorage.getItem('plant_health_users') || '[]');
        if (users.some((u: any) => u.email === email)) {
            setAuthError("An account with this email already exists.");
            return;
        }
        const newUser = {
            id: `user-${Date.now()}`,
            email,
            password,
            // FIX: Use 'as const' to ensure the role is typed as the literal 'user', not a generic string.
            // This resolves the type error where 'string' is not assignable to 'user' | 'admin'.
            role: 'user' as const,
        };
        users.push(newUser);
        localStorage.setItem('plant_health_users', JSON.stringify(users));
        
        // Automatically log in the new user
        const userData: User = { id: newUser.id, email: newUser.email, role: newUser.role };
        setCurrentUser(userData);
        localStorage.setItem('plant_health_currentUser', JSON.stringify(userData));
    }, []);

    const handleSocialLogin = useCallback((provider: 'google' | 'facebook') => {
        const credentials = provider === 'google'
            ? { email: 'google.user@plant.health', password: 'google123' }
            : { email: 'facebook.user@plant.health', password: 'facebook123' };

        handleLogin(credentials.email, credentials.password);
    }, [handleLogin]);

    const handleLogout = useCallback(() => {
        setCurrentUser(null);
        localStorage.removeItem('plant_health_currentUser');
    }, []);


    if (!currentUser) {
        return <AuthPage onLogin={handleLogin} onRegister={handleRegister} onSocialLogin={handleSocialLogin} error={authError} />;
    }

    return (
        <LocationProvider>
        <div className="min-h-screen bg-green-50/50 font-sans">
            <Header currentUser={currentUser} onLogout={handleLogout} />
            
            {currentUser.role === 'admin' ? (
                <AdminDashboard analyses={historicalAnalyses} />
            ) : (
                <main className="container mx-auto p-4 md:p-8">
                    <div className="text-center mb-8 md:mb-12">
                        <h2 className="text-3xl md:text-4xl font-bold text-green-800">Your AI Plant Doctor</h2>
                        <p className="text-lg text-gray-600 mt-2 max-w-2xl mx-auto">
                            Upload a photo of a plant leaf and get an AI-powered diagnosis, disease explanation, and step-by-step treatment guidance.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-8 bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
                            <ImageUploader
                                onImageSelect={handleImageSelect}
                                onAnalyze={handleAnalyzeClick}
                                imagePreview={imagePreview}
                                isLoading={isLoading}
                            />
                            <AnalysisResultDisplay
                                result={analysisResult}
                                isLoading={isLoading}
                                error={error}
                                hasImage={!!imagePreview}
                            />
                        </div>
                        <div className="lg:col-span-4">
                            <DiseaseGuideDashboard />
                        </div>
                    </div>
                </main>
            )}

            <footer className="text-center p-6 mt-8 text-gray-500 text-sm">
                <p>&copy; {new Date().getFullYear()} AI Plant Doctor. All rights reserved.</p>
            </footer>
        </div>
        </LocationProvider>
    );
};

export default App;