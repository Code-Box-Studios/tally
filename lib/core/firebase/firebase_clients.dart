import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';

final class FirebaseClients {
  const FirebaseClients({
    required this.app,
    required this.auth,
    required this.firestore,
    required this.functions,
    required this.storage,
  });
  final FirebaseApp app;
  final FirebaseAuth auth;
  final FirebaseFirestore firestore;
  final FirebaseFunctions functions;
  final FirebaseStorage storage;
}
