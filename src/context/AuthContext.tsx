
"use client";

import type { User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import type { Role } from "@/config/roles";
import { doc, getDoc, Timestamp } from "firebase/firestore";
// Import React and other hooks/types explicitly
import React, { useEffect, useContext, createContext, useState, type ReactNode, useCallback } from "react";

interface UserProfile extends FirebaseUser {
  role?: Role;
  assignedClassIds?: string[]; // For teachers
  // Add other profile fields as needed
  classId?: string; // For students
  className?: string; // For students
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  role: Role | null;
  refreshUser: () => Promise<void>; 
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  role: null,
  refreshUser: async () => {}, 
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    // Apply theme from localStorage on initial app load (client-side)
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
        // Optionally ensure "light" is set if nothing is there or it's an old value
        // This ensures a default if localStorage is empty or has an invalid value.
        if (savedTheme !== "light") {
            localStorage.setItem("theme", "light");
        }
      }
    }
  }, []); // Runs once when AuthProvider mounts

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser | null) => {
    if (!firebaseUser) {
      setUser(null);
      setRole(null);
      setLoading(false);
      return;
    }

    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      let userProfileData: UserProfile = { 
        ...firebaseUser,
      } as UserProfile; 

      if (userDocSnap.exists()) {
        const firestoreData = userDocSnap.data();
        userProfileData.role = firestoreData?.role as Role | undefined;
        
        if ((!firebaseUser.displayName || firebaseUser.displayName.trim() === "") && firestoreData?.name) {
          userProfileData.displayName = firestoreData.name;
        } else {
          userProfileData.displayName = firebaseUser.displayName || null;
        }
        // Update photoURL from Firebase Auth as it's the source of truth after updateProfile
        userProfileData.photoURL = firebaseUser.photoURL;


        if (userProfileData.role === 'guru') {
          userProfileData.assignedClassIds = firestoreData?.assignedClassIds || [];
        } else if (userProfileData.role === 'siswa') {
          userProfileData.classId = firestoreData?.classId;
          userProfileData.className = firestoreData?.className;

          if (userProfileData.classId && !userProfileData.className) {
              const classDocRef = doc(db, "classes", userProfileData.classId);
              const classDocSnap = await getDoc(classDocRef);
              if (classDocSnap.exists()) {
                  userProfileData.className = classDocSnap.data()?.name;
              }
          }
        }
      } else {
        userProfileData.displayName = firebaseUser.displayName || null;
        userProfileData.photoURL = firebaseUser.photoURL;
      }
      setUser(userProfileData);
      setRole(userProfileData.role || null);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      setUser(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      setLoading(true); 
      await fetchUserProfile(firebaseUser);
    });
    return () => unsubscribe();
  }, [fetchUserProfile]);

  const refreshUser = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      setLoading(true);
      await currentUser.reload(); 
      const refreshedFirebaseUser = auth.currentUser; 
      await fetchUserProfile(refreshedFirebaseUser);
    }
  }, [fetchUserProfile]);


  return (
    <AuthContext.Provider value={{ user, loading, role, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

