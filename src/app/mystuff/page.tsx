'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/contexts/AuthContext';

import { getFirestore, doc, onSnapshot, collection, query, where, documentId } from 'firebase/firestore';
import {app} from "@/libs/firebaseConfig"
import Header from "@/components/layout/Header";


export default function MyStuff() {
    return (
        <div>
            <Header />
            my MyStuff
        </div>
    );
}