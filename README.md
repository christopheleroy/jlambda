# jLambda
Pseudo Lambda Calculus in JSON format to process JSON documents (array oriented)


Are you wading through relatively voluminous JSON data from disparate sources and need to combine them ?

jLambda is conceived to let you specify how to combine them, with a small set of operations such as :
 - joining across datasets
 - search or search/replace with RegExp for some fields, and upper/lower case (and "grep")
 - renaming fields
 - conditional
 - shrink or explode arrays etc
 - (soon:) simple numerical expressions, and summary stats such as max/average/min, unique, sort
 
jLambda offers a Functional Programming interface for these few operations, all expressed in JSON.

For example:

{chain: [ {rename: {'studyId': 'STUDYID', 'subjectId': 'USUBJID', studyDesc: 'STUDYDESCRIPTION' }},
          {if: {f:'regexp', match: 'Aspirin', field: 'studyDesc', mod: 'i' }, then: {f:'upper', field: 'studyId'}, else: {f:'lower', field: 'studyId'} }
        ]
}

will take a single dataset, rename its 'colums' STUDYID/USUBJID/STUDYDESCRIPTION to studyID, subjectId, studyDesc,
then change the records by raising uppercase the studyId when the study description contains the word aspirin (case insensitive),
and change the studyId to lowercase otherwise.


An example of a join: if your dataset is 2 arrays of JSON objects, whose common (joinable) value is 'subjectId' in the first dataset and 'SUBJID' in the 2nd dataset:

{join: ['a', 'b'], on: { a: 'subjectId', b: 'SUBJID'}, select: { a: {'subjectId': 'subjectId', 'age': 'age'}, b:{'race': 'RACE', 'gender': 'GENDER' } } }


More examples to come.
