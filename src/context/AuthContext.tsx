
"use client";

import type { User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import type { Role } from "@/config/roles";
import { doc, getDoc, Timestamp, query, collection, where, limit, getDocs } from "firebase/firestore";
// Import React and other hooks/types explicitly
import React, { useEffect, useContext, createContext, useState, type ReactNode, useCallback } from "react";
import { signOut } from "firebase/auth";
import { useToast } from "@/hooks/use-toast"; // Added for session timeout toast

interface UserProfile extends FirebaseUser {
  role?: Role;
  assignedClassIds?: string[]; // For teachers
  classId?: string; // For students
  className?: string; // For students
  linkedStudentId?: string; // For parents: UID of their child
  linkedStudentName?: string; // For parents: Name of their child
  linkedStudentClassId?: string; // For parents: Class ID of their child
  linkedStudentClassName?: string; // For parents: Class Name of their child
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

const LAST_ACTIVITY_STORAGE_KEY = 'lastUserActivityTimestamp';
const INACTIVITY_TIMEOUT_MS = 1.5 * 60 * 60 * 1000; // 1.5 jam di miliseconds


export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);
  const { toast } = useToast(); // Initialize toast

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, []);

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser | null) => {
    if (!firebaseUser) {
      setUser(null);
      setRole(null);
      setLoading(false);
      localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY); // Clear activity timestamp on logout
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
                
                if (studentData.classId) {
                    const studentClassDocRef = doc(db, "classes", studentData.classId);
                    const studentClassDocSnap = await getDoc(studentClassDocRef);
                    if (studentClassDocSnap.exists()) {
                        userProfileData.linkedStudentClassName = studentClassDocSnap.data()?.name;
                    } else {
                        console.warn(`AuthContext: Class document with ID ${studentData.classId} (for linked student ${studentData.name}) not found.`);
                        userProfileData.linkedStudentClassName = studentData.classId; // Fallback to classId if name not found
                    }
                } else {
                   console.warn(`AuthContext: Linked student ${studentData.name} (UID: ${parentData.studentId}) for parent ${firebaseUser.uid} does not have a classId in their 'users' document.`);
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

  // Inactivity timeout logic
  useEffect(() => {
    let activityInterval: NodeJS.Timeout | null = null;
    const eventsToTrack: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    const updateLastActivity = () => {
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, Date.now().toString());
    };

    const handleActivity = () => {
      updateLastActivity();
    };

    const checkInactivity = () => {
      const lastActivityTimestamp = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
      if (lastActivityTimestamp) {
        const lastActivityTime = parseInt(lastActivityTimestamp, 10);
        if (Date.now() - lastActivityTime > INACTIVITY_TIMEOUT_MS) {
          if (auth.currentUser) {
            toast({
              title: "Sesi Berakhir",
              description: `Anda telah dikeluarkan secara otomatis karena tidak aktif selama ${INACTIVITY_TIMEOUT_MS / (60 * 1000)} menit.`,
              variant: "default",
            });
            signOut(auth).catch(error => {
              console.error("Error during automatic sign-out:", error);
            });
            // Cleanup immediately after initiating signOut
            if (activityInterval) clearInterval(activityInterval);
            eventsToTrack.forEach(event => window.removeEventListener(event, handleActivity));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
          }
        }
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkInactivity();
      }
    };

    if (user && !loading) {
      updateLastActivity(); 

      eventsToTrack.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));
      document.addEventListener('visibilitychange', handleVisibilityChange);

      activityInterval = setInterval(checkInactivity, 60 * 1000); // Check every minute

    } else if (!user && !loading) {
      // User is logged out or was never logged in
      if (activityInterval) clearInterval(activityInterval);
      eventsToTrack.forEach(event => window.removeEventListener(event, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    }

    return () => { // Cleanup function for when the component unmounts or user/loading changes
      if (activityInterval) clearInterval(activityInterval);
      eventsToTrack.forEach(event => window.removeEventListener(event, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, loading, toast]);


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
