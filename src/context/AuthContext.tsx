
"use client";

import type { User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import type { Role } from "@/config/roles";
import { doc, getDoc, Timestamp, query, collection, where, limit, getDocs } from "firebase/firestore";
// Import React and other hooks/types explicitly
import React, { useEffect, useContext, createContext, useState, type ReactNode, useCallback } from "react";

interface UserProfile extends FirebaseUser {
  role?: Role;
  assignedClassIds?: string[]; // For teachers
  classId?: string; // For students
  className?: string; // For students
  linkedStudentId?: string; // For parents: UID of their child
  linkedStudentName?: string; // For parents: Name of their child
  linkedStudentClassId?: string; // For parents: Class ID of their child
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
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
        // if (savedTheme !== "light") { // Ensure theme is set even if null/undefined
        //     localStorage.setItem("theme", "light");
        // }
      }
    }
  }, []);

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
        } else if (userProfileData.role === 'orangtua') {
          const parentProfileQuery = query(collection(db, "parents"), where("uid", "==", firebaseUser.uid), limit(1));
          const parentProfileSnapshot = await getDocs(parentProfileQuery);
          if (!parentProfileSnapshot.empty) {
            const parentData = parentProfileSnapshot.docs[0].data();
            userProfileData.linkedStudentId = parentData.studentId;
            if (parentData.studentId) {
              const studentUserDocRef = doc(db, "users", parentData.studentId); 
              const studentUserDocSnap = await getDoc(studentUserDocRef);
              if (studentUserDocSnap.exists()) {
                const studentData = studentUserDocSnap.data();
                userProfileData.linkedStudentName = studentData.name;
                userProfileData.linkedStudentClassId = studentData.classId;
                if (!studentData.classId) {
                  console.warn(`AuthContext: Linked student ${studentData.name} (UID: ${parentData.studentId}) for parent ${firebaseUser.uid} does not have a classId in their 'users' document.`);
                }
                if(studentData.classId && !studentData.className) {
                    const classDocRef = doc(db, "classes", studentData.classId);
                    const classDocSnap = await getDoc(classDocRef);
                    if (classDocSnap.exists()) {
                        // UserProfileData already has className for student, but for parent, it's on linkedStudent. We don't directly set className for parent.
                        // It will be user.linkedStudentClassId and user.linkedStudentName
                    }
                }
              } else {
                console.warn(`AuthContext: Student document with UID ${parentData.studentId} (linked to parent ${firebaseUser.uid}) not found in 'users' collection.`);
              }
            } else {
               console.warn(`AuthContext: Parent profile for ${firebaseUser.uid} does not have a studentId linked.`);
            }
          } else {
             console.warn(`AuthContext: No parent profile found in 'parents' collection for Auth UID ${firebaseUser.uid}. Ensure a parent profile exists and its 'uid' field matches the Firebase Auth UID.`);
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
      setUser({ ...firebaseUser } as UserProfile);
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
