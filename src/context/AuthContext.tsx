
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
      if (firebaseUser) {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        let userProfileData: UserProfile = { 
          ...firebaseUser,
          // displayName will be initially from firebaseUser, can be overridden below
        } as UserProfile; 

        if (userDocSnap.exists()) {
          const firestoreData = userDocSnap.data();
          userProfileData.role = firestoreData?.role as Role | undefined;
          setRole(userProfileData.role || null);

          // Prioritize name from Firestore for displayName if Firebase Auth displayName is missing
          if (!userProfileData.displayName && firestoreData?.name) {
            userProfileData.displayName = firestoreData.name;
          }
          // Still ensure it's at least an empty string or null if both are missing
          userProfileData.displayName = userProfileData.displayName || firestoreData?.name || null;


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
          // User exists in Auth but not in Firestore users collection (should ideally not happen post-registration)
          // Fallback to FirebaseUser's displayName if any, role would be null
           userProfileData.displayName = firebaseUser.displayName || null;
           setRole(null);
        }
        setUser(userProfileData);
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
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
