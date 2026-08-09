<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use Illuminate\Http\Request;

class ContactController extends Controller
{
    public function index(Request $request)
    {
        $q = Contact::query();
        if ($s = $request->query('search')) {
            $q->where('name', 'like', "%{$s}%")->orWhere('email', 'like', "%{$s}%")->orWhere('phone', 'like', "%{$s}%");
        }
        return response()->json($q->orderBy('name')->paginate((int) $request->query('per_page', 25)));
    }

    public function show(Contact $contact)
    {
        return response()->json(['contact' => $contact->load('leads')]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string',
            'email' => 'nullable|email',
            'phone' => 'nullable|string',
            'city' => 'nullable|string',
        ]);
        return response()->json(['contact' => Contact::create($data)], 201);
    }
}
