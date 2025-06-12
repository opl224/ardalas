
"use client";

import type { User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import type { Role } from "@/config/roles";
import { doc, getDoc } from "firebase/firestore";
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
        // Fetch user role and other details from Firestore
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        let userProfileData: UserProfile = { ...firebaseUser } as UserProfile; // Cast to include custom fields

        if (userDocSnap.exists()) {
          const firestoreData = userDocSnap.data();
          userProfileData.role = firestoreData?.role as Role | undefined;
          setRole(userProfileData.role || null);

          if (userProfileData.role === 'guru') {
            userProfileData.assignedClassIds = firestoreData?.assignedClassIds || [];
          } else if (userProfileData.role === 'siswa') {
            userProfileData.classId = firestoreData?.classId;
            // Assuming student documents in 'users' collection might have 'className'
            // If not, this will be undefined, and we'll need to fetch it from 'classes' collection
            // based on classId when displaying or storing submission.
            // For now, let's assume it *could* be there.
            const studentDocRef = doc(db, "students", firebaseUser.uid); // Students specific data might be in 'students' collection
            const studentDocSnap = await getDoc(studentDocRef);
            if (studentDocSnap.exists()) {
                userProfileData.classId = studentDocSnap.data()?.classId;
                userProfileData.className = studentDocSnap.data()?.className;
            } else { // Fallback to users collection if not in students, or if students collection isn't the primary source for this
                 userProfileData.classId = firestoreData?.classId; // classId from 'users' doc
                 userProfileData.className = firestoreData?.className; // className from 'users' doc
            }

            // If className is still not found, try to fetch from classes collection
            if (userProfileData.classId && !userProfileData.className) {
                const classDocRef = doc(db, "classes", userProfileData.classId);
                const classDocSnap = await getDoc(classDocRef);
                if (classDocSnap.exists()) {
                    userProfileData.className = classDocSnap.data()?.name;
                }
            }
          }
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

    
    