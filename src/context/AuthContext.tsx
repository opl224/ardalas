
"use client";

import type { User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import type { Role } from "@/config/roles";
import { doc, getDoc, Timestamp } from "firebase/firestore";
// Import React and other hooks/types explicitly
import React, { useEffect, useContext, createContext, useState, type ReactNode } from "react";

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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  role: null,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          // Start with FirebaseUser data
          let userProfileData: UserProfile = { 
            ...firebaseUser,
            // displayName will be initially from firebaseUser, potentially overridden
          } as UserProfile; 

          if (userDocSnap.exists()) {
            const firestoreData = userDocSnap.data();
            userProfileData.role = firestoreData?.role as Role | undefined;
            
            // Prioritize Firestore 'name' for displayName if Firebase Auth 'displayName' is missing/empty
            // and Firestore 'name' exists.
            if ((!firebaseUser.displayName || firebaseUser.displayName.trim() === "") && firestoreData?.name) {
              userProfileData.displayName = firestoreData.name;
            } else {
              // Fallback to Firebase Auth displayName or null if that's also missing
              userProfileData.displayName = firebaseUser.displayName || null;
            }

            if (userProfileData.role === 'guru') {
              userProfileData.assignedClassIds = firestoreData?.assignedClassIds || [];
            } else if (userProfileData.role === 'siswa') {
              userProfileData.classId = firestoreData?.classId;
              userProfileData.className = firestoreData?.className;

              // If className is still missing but classId exists, try to fetch it
              if (userProfileData.classId && !userProfileData.className) {
                  const classDocRef = doc(db, "classes", userProfileData.classId);
                  const classDocSnap = await getDoc(classDocRef);
                  if (classDocSnap.exists()) {
                      userProfileData.className = classDocSnap.data()?.name;
                  }
              }
            }
          } else {
            // User exists in Auth but not in Firestore users collection
            // Use FirebaseUser's displayName; role will remain undefined (and thus null later)
            userProfileData.displayName = firebaseUser.displayName || null;
          }
          setUser(userProfileData);
          setRole(userProfileData.role || null); // Set role based on profile data
        } else {
          setUser(null);
          setRole(null);
        }
      } catch (error) {
        console.error("Error in onAuthStateChanged listener:", error);
        // Ensure a clean state on error
        setUser(null);
        setRole(null);
      } finally {
        // Always set loading to false after processing
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, role }}>
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

