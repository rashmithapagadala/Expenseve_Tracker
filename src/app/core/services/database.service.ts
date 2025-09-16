import { EnvironmentInjector, inject, Injectable, runInInjectionContext } from '@angular/core';
import { AngularFireDatabase, SnapshotAction } from '@angular/fire/compat/database';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import firebase from 'firebase/compat/app';
import { debounceTime, distinctUntilChanged, Observable, Subject } from 'rxjs';

import { Expense } from '../interfaces/expense-model';
import { UserDetails } from '../interfaces/user-details';

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private expenseAddedSource = new Subject<string>();
  private categoriesAddedSource = new Subject<string>();
  expenseAdded$ = this.expenseAddedSource.asObservable();
  categoriesAdded$ = this.categoriesAddedSource.asObservable();

  private injectionContext = inject(EnvironmentInjector);

  constructor(public db: AngularFireDatabase, private afAuth: AngularFireAuth) {}

  /* ------------ Announcers ------------ */

  announceExpenseCreated(message: string) {
    this.expenseAddedSource.next(message);
  }

  announceCategoriesAdded(message: string) {
    this.categoriesAddedSource.next(message);
  }

  /* ------------ Expenses ------------ */

  saveNewExpense(expense: Expense, userId: string): firebase.database.ThenableReference {
    return this.db.database.ref(`users/${userId}/expenses`).push(expense);
  }

  getUserExpenses(userId: string): Observable<SnapshotAction<unknown>[]> {
    return runInInjectionContext(this.injectionContext, () => {
      return this.db
        .list(`users/${userId}/expenses`)
        .snapshotChanges()
        .pipe(
          debounceTime(500),
          distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
        );
    });
  }

  updateExpense(userId: string, key: string, expense: Expense): Promise<void> {
    return runInInjectionContext(this.injectionContext, () => {
      return this.db.list(`users/${userId}/expenses`).update(key, expense);
    });
  }

  deleteExpense(userId: string, key: string): Promise<void> {
    return runInInjectionContext(this.injectionContext, () => {
      return this.db.list(`users/${userId}/expenses`).remove(key);
    });
  }

  addExpense(userId: string, expense: Expense): firebase.database.ThenableReference {
    return runInInjectionContext(this.injectionContext, () => {
      return this.db.list(`users/${userId}/expenses`).push(expense);
    });
  }

  /**
   * Batch update scoped to a single user.
   * Overloads:
   *  - batchUpdateExpenses(userId, updates)
   *  - batchUpdateExpenses(updates)  // infers uid from current auth user
   */
  batchUpdateExpenses(updates: Record<string, Expense | null>): Promise<void>;
  batchUpdateExpenses(userId: string, updates: Record<string, Expense | null>): Promise<void>;
  batchUpdateExpenses(
    a: string | Record<string, Expense | null>,
    b?: Record<string, Expense | null>
  ): Promise<void> {
    return runInInjectionContext(this.injectionContext, async () => {
      let uid: string;
      let updates: Record<string, Expense | null>;

      if (typeof a === 'string') {
        // New style: (userId, updates)
        uid = a;
        updates = b ?? {};
      } else {
        // Legacy style: (updates) -> infer uid from auth
        updates = a ?? {};
        const user = await this.afAuth.currentUser;
        if (!user?.uid) throw new Error('Not signed in');
        uid = user.uid;
      }

      const scoped: Record<string, Expense | null> = {};
      for (const k of Object.keys(updates)) {
        scoped[`users/${uid}/expenses/${k}`] = updates[k];
      }
      return this.db.database.ref().update(scoped);
    });
  }

  /**
   * Push a list of expenses efficiently for this user.
   */
  batchPushExpensesWithBatch(expenses: Expense[], userId: string): Promise<void> {
    return runInInjectionContext(this.injectionContext, () => {
      const updates: Record<string, Expense> = {};
      const baseRef = this.db.database.ref(`users/${userId}/expenses`);
      expenses.forEach((expense) => {
        const newKey = baseRef.push().key;
        if (newKey) {
          updates[`users/${userId}/expenses/${newKey}`] = expense;
        }
      });
      return this.db.database.ref().update(updates);
    });
  }

  /* ------------ Lists / config under the user ------------ */

  saveNewCategories(categories: string[], userId: string): Promise<void> {
    return this.db.database.ref(`users/${userId}/categories`).set(categories);
  }

  saveNewImportedFiles(files: string[], userId: string): Promise<void> {
    return this.db.database.ref(`users/${userId}/filesImported`).set(files);
  }

  saveNewExpenseSourceTypes(types: string[], userId: string): Promise<void> {
    return this.db.database.ref(`users/${userId}/types`).set(types);
  }

  /* ------------ User details (READ/WRITE by UID only) ------------ */

  /** Always fetch by UID (per‑user rules). */
  getUserDetailsById(userId: string): Promise<firebase.database.DataSnapshot> {
    return this.db.database.ref(`users/${userId}`).once('value');
  }

  /** Update the user's root node (or keep a /profile child if you prefer). */
  updateUserDetails(userId: string, userDetails: UserDetails): Promise<void> {
    return this.db.database.ref(`users/${userId}`).update(userDetails);
  }

  // If you decide to keep a separate profile:
  // getUserProfile(userId: string): Promise<firebase.database.DataSnapshot> {
  //   return this.db.database.ref(`users/${userId}/profile`).once('value');
  // }
  // saveUserProfile(userId: string, profile: any): Promise<void> {
  //   return this.db.database.ref(`users/${userId}/profile`).set(profile);
  // }
}
