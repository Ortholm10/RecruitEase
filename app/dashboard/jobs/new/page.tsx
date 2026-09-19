"use client";

import { useActionState } from "react";
import { createJob, type CreateJobState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initialState: CreateJobState = { error: null };

export default function NewJobPage() {
  const [state, formAction, isPending] = useActionState(
    createJob,
    initialState,
  );

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Create a job</CardTitle>
          <CardDescription>
            Paste the job description as-is — structured requirements get
            extracted from it later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="title">Job title</Label>
              <Input
                id="title"
                name="title"
                placeholder="Full Stack Engineer"
                required
                disabled={isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="jdText">Job description</Label>
              <Textarea
                id="jdText"
                name="jdText"
                rows={14}
                placeholder="Paste the full job description here..."
                required
                disabled={isPending}
              />
            </div>
            {state.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Creating..." : "Create job"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
