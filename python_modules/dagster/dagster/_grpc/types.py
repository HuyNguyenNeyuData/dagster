import base64
import zlib
from typing import AbstractSet, Any, Mapping, NamedTuple, Optional, Sequence

import dagster._check as check
from dagster._core.code_pointer import CodePointer
from dagster._core.definitions.events import AssetKey
from dagster._core.execution.plan.state import KnownExecutionState
from dagster._core.execution.retries import RetryMode
from dagster._core.host_representation.external_data import DEFAULT_MODE_NAME
from dagster._core.host_representation.origin import (
    CodeLocationOrigin,
    ExternalJobOrigin,
    ExternalRepositoryOrigin,
)
from dagster._core.instance.ref import InstanceRef
from dagster._core.origin import JobPythonOrigin, get_python_environment_entry_point
from dagster._serdes import serialize_value, whitelist_for_serdes
from dagster._utils.error import SerializableErrorInfo


@whitelist_for_serdes(
    storage_field_names={
        "job_origin": "pipeline_origin",
        "job_snapshot_id": "pipeline_snapshot_id",
    }
)
class ExecutionPlanSnapshotArgs(
    NamedTuple(
        "_ExecutionPlanSnapshotArgs",
        [
            ("job_origin", ExternalJobOrigin),
            ("solid_selection", Sequence[str]),
            ("run_config", Mapping[str, object]),
            ("step_keys_to_execute", Optional[Sequence[str]]),
            ("job_snapshot_id", str),
            ("known_state", Optional[KnownExecutionState]),
            ("instance_ref", Optional[InstanceRef]),
            ("asset_selection", Optional[AbstractSet[AssetKey]]),
            ("mode", str),
        ],
    )
):
    def __new__(
        cls,
        job_origin: ExternalJobOrigin,
        solid_selection: Sequence[str],
        run_config: Mapping[str, object],
        step_keys_to_execute: Optional[Sequence[str]],
        job_snapshot_id: str,
        known_state: Optional[KnownExecutionState] = None,
        instance_ref: Optional[InstanceRef] = None,
        asset_selection: Optional[AbstractSet[AssetKey]] = None,
        mode: str = DEFAULT_MODE_NAME,
    ):
        return super(ExecutionPlanSnapshotArgs, cls).__new__(
            cls,
            job_origin=check.inst_param(job_origin, "job_origin", ExternalJobOrigin),
            solid_selection=check.opt_sequence_param(
                solid_selection, "solid_selection", of_type=str
            ),
            run_config=check.mapping_param(run_config, "run_config", key_type=str),
            mode=check.str_param(mode, "mode"),
            step_keys_to_execute=check.opt_nullable_sequence_param(
                step_keys_to_execute, "step_keys_to_execute", of_type=str
            ),
            job_snapshot_id=check.str_param(job_snapshot_id, "job_snapshot_id"),
            known_state=check.opt_inst_param(known_state, "known_state", KnownExecutionState),
            instance_ref=check.opt_inst_param(instance_ref, "instance_ref", InstanceRef),
            asset_selection=check.opt_nullable_set_param(
                asset_selection, "asset_selection", of_type=AssetKey
            ),
        )


def _get_entry_point(origin: JobPythonOrigin):
    return (
        origin.repository_origin.entry_point
        if origin.repository_origin.entry_point
        else get_python_environment_entry_point(origin.executable_path)
    )


@whitelist_for_serdes(
    storage_field_names={
        "job_origin": "pipeline_origin",
        "run_id": "pipeline_run_id",
    }
)
class ExecuteRunArgs(
    NamedTuple(
        "_ExecuteRunArgs",
        [
            # Deprecated, only needed for back-compat since it can be pulled from the PipelineRun
            ("job_origin", JobPythonOrigin),
            ("run_id", str),
            ("instance_ref", Optional[InstanceRef]),
            ("set_exit_code_on_failure", Optional[bool]),
        ],
    )
):
    def __new__(
        cls,
        job_origin: JobPythonOrigin,
        run_id: str,
        instance_ref: Optional[InstanceRef],
        set_exit_code_on_failure: Optional[bool] = None,
    ):
        return super(ExecuteRunArgs, cls).__new__(
            cls,
            job_origin=check.inst_param(
                job_origin,
                "job_origin",
                JobPythonOrigin,
            ),
            run_id=check.str_param(run_id, "run_id"),
            instance_ref=check.opt_inst_param(instance_ref, "instance_ref", InstanceRef),
            set_exit_code_on_failure=(
                True
                if check.opt_bool_param(set_exit_code_on_failure, "set_exit_code_on_failure")
                is True
                else None
            ),  # for back-compat
        )

    def get_command_args(self) -> Sequence[str]:
        return _get_entry_point(self.job_origin) + [
            "api",
            "execute_run",
            serialize_value(self),
        ]


@whitelist_for_serdes(
    storage_field_names={
        "job_origin": "pipeline_origin",
        "run_id": "pipeline_run_id",
    }
)
class ResumeRunArgs(
    NamedTuple(
        "_ResumeRunArgs",
        [
            # Deprecated, only needed for back-compat since it can be pulled from the DagsterRun
            ("job_origin", JobPythonOrigin),
            ("run_id", str),
            ("instance_ref", Optional[InstanceRef]),
            ("set_exit_code_on_failure", Optional[bool]),
        ],
    )
):
    def __new__(
        cls,
        job_origin: JobPythonOrigin,
        run_id: str,
        instance_ref: Optional[InstanceRef],
        set_exit_code_on_failure: Optional[bool] = None,
    ):
        return super(ResumeRunArgs, cls).__new__(
            cls,
            job_origin=check.inst_param(
                job_origin,
                "job_origin",
                JobPythonOrigin,
            ),
            run_id=check.str_param(run_id, "run_id"),
            instance_ref=check.opt_inst_param(instance_ref, "instance_ref", InstanceRef),
            set_exit_code_on_failure=(
                True
                if check.opt_bool_param(set_exit_code_on_failure, "set_exit_code_on_failure")
                is True
                else None
            ),  # for back-compat
        )

    def get_command_args(self) -> Sequence[str]:
        return _get_entry_point(self.job_origin) + [
            "api",
            "resume_run",
            serialize_value(self),
        ]


@whitelist_for_serdes(
    storage_name="ExecuteExternalPipelineArgs",
    storage_field_names={
        "job_origin": "pipeline_origin",
        "run_id": "pipeline_run_id",
    },
)
class ExecuteExternalJobArgs(
    NamedTuple(
        "_ExecuteExternalJobArgs",
        [
            ("job_origin", ExternalJobOrigin),
            ("run_id", str),
            ("instance_ref", Optional[InstanceRef]),
        ],
    )
):
    def __new__(
        cls,
        job_origin: ExternalJobOrigin,
        run_id: str,
        instance_ref: Optional[InstanceRef],
    ):
        return super(ExecuteExternalJobArgs, cls).__new__(
            cls,
            job_origin=check.inst_param(
                job_origin,
                "job_origin",
                ExternalJobOrigin,
            ),
            run_id=check.str_param(run_id, "run_id"),
            instance_ref=check.opt_inst_param(instance_ref, "instance_ref", InstanceRef),
        )


@whitelist_for_serdes(
    storage_field_names={
        "job_origin": "pipeline_origin",
        "run_id": "pipeline_run_id",
    }
)
class ExecuteStepArgs(
    NamedTuple(
        "_ExecuteStepArgs",
        [
            # Deprecated, only needed for back-compat since it can be pulled from the DagsterRun
            ("job_origin", JobPythonOrigin),
            ("run_id", str),
            ("step_keys_to_execute", Optional[Sequence[str]]),
            ("instance_ref", Optional[InstanceRef]),
            ("retry_mode", Optional[RetryMode]),
            ("known_state", Optional[KnownExecutionState]),
            ("should_verify_step", Optional[bool]),
        ],
    )
):
    def __new__(
        cls,
        job_origin: JobPythonOrigin,
        run_id: str,
        step_keys_to_execute: Optional[Sequence[str]],
        instance_ref: Optional[InstanceRef] = None,
        retry_mode: Optional[RetryMode] = None,
        known_state: Optional[KnownExecutionState] = None,
        should_verify_step: Optional[bool] = None,
    ):
        return super(ExecuteStepArgs, cls).__new__(
            cls,
            job_origin=check.inst_param(job_origin, "job_origin", JobPythonOrigin),
            run_id=check.str_param(run_id, "run_id"),
            step_keys_to_execute=check.opt_nullable_sequence_param(
                step_keys_to_execute, "step_keys_to_execute", of_type=str
            ),
            instance_ref=check.opt_inst_param(instance_ref, "instance_ref", InstanceRef),
            retry_mode=check.opt_inst_param(retry_mode, "retry_mode", RetryMode),
            known_state=check.opt_inst_param(known_state, "known_state", KnownExecutionState),
            should_verify_step=check.opt_bool_param(
                should_verify_step, "should_verify_step", False
            ),
        )

    def _get_compressed_args(self) -> str:
        # Compress, then base64 encode so we can pass it around as a str
        return base64.b64encode(zlib.compress(serialize_value(self).encode())).decode()

    def get_command_args(self, skip_serialized_namedtuple: bool = False) -> Sequence[str]:
        """Get the command args to run this step. If skip_serialized_namedtuple is True, then get_command_env should
        be used to pass the args to Click using an env var.
        """
        return (
            _get_entry_point(self.job_origin)
            + ["api", "execute_step"]
            + (
                ["--compressed-input-json", self._get_compressed_args()]
                if not skip_serialized_namedtuple
                else []
            )
        )

    def get_command_env(self) -> Sequence[Mapping[str, str]]:
        """Get the env vars for overriding the Click args of this step. Used in conjuction with
        get_command_args(skip_serialized_namedtuple=True).
        """
        return [
            {"name": "DAGSTER_COMPRESSED_EXECUTE_STEP_ARGS", "value": self._get_compressed_args()},
        ]


@whitelist_for_serdes
class LoadableRepositorySymbol(
    NamedTuple("_LoadableRepositorySymbol", [("repository_name", str), ("attribute", str)])
):
    def __new__(cls, repository_name: str, attribute: str):
        return super(LoadableRepositorySymbol, cls).__new__(
            cls,
            repository_name=check.str_param(repository_name, "repository_name"),
            attribute=check.str_param(attribute, "attribute"),
        )


@whitelist_for_serdes
class ListRepositoriesResponse(
    NamedTuple(
        "_ListRepositoriesResponse",
        [
            ("repository_symbols", Sequence[LoadableRepositorySymbol]),
            ("executable_path", Optional[str]),
            ("repository_code_pointer_dict", Mapping[str, CodePointer]),
            ("entry_point", Optional[Sequence[str]]),
            ("container_image", Optional[str]),
            ("container_context", Optional[Mapping[str, Any]]),
            ("dagster_library_versions", Optional[Mapping[str, str]]),
        ],
    )
):
    def __new__(
        cls,
        repository_symbols: Sequence[LoadableRepositorySymbol],
        executable_path: Optional[str] = None,
        repository_code_pointer_dict: Optional[Mapping[str, CodePointer]] = None,
        entry_point: Optional[Sequence[str]] = None,
        container_image: Optional[str] = None,
        container_context: Optional[Mapping] = None,
        dagster_library_versions: Optional[Mapping[str, str]] = None,
    ):
        return super(ListRepositoriesResponse, cls).__new__(
            cls,
            repository_symbols=check.sequence_param(
                repository_symbols, "repository_symbols", of_type=LoadableRepositorySymbol
            ),
            executable_path=check.opt_str_param(executable_path, "executable_path"),
            repository_code_pointer_dict=check.opt_mapping_param(
                repository_code_pointer_dict,
                "repository_code_pointer_dict",
                key_type=str,
                value_type=CodePointer,
            ),
            entry_point=(
                check.sequence_param(entry_point, "entry_point", of_type=str)
                if entry_point is not None
                else None
            ),
            container_image=check.opt_str_param(container_image, "container_image"),
            container_context=(
                check.dict_param(container_context, "container_context")
                if container_context is not None
                else None
            ),
            dagster_library_versions=check.opt_nullable_mapping_param(
                dagster_library_versions, "dagster_library_versions"
            ),
        )


@whitelist_for_serdes
class ListRepositoriesInput(
    NamedTuple(
        "_ListRepositoriesInput",
        [
            ("module_name", Optional[str]),
            ("python_file", Optional[str]),
            ("working_directory", Optional[str]),
            ("attribute", Optional[str]),
        ],
    )
):
    def __new__(
        cls,
        module_name: Optional[str],
        python_file: Optional[str],
        working_directory: Optional[str],
        attribute: Optional[str],
    ):
        check.invariant(not (module_name and python_file), "Must set only one")
        check.invariant(module_name or python_file, "Must set at least one")
        return super(ListRepositoriesInput, cls).__new__(
            cls,
            module_name=check.opt_str_param(module_name, "module_name"),
            python_file=check.opt_str_param(python_file, "python_file"),
            working_directory=check.opt_str_param(working_directory, "working_directory"),
            attribute=check.opt_str_param(attribute, "attribute"),
        )


@whitelist_for_serdes
class PartitionArgs(
    NamedTuple(
        "_PartitionArgs",
        [
            ("repository_origin", ExternalRepositoryOrigin),
            ("partition_set_name", str),
            ("partition_name", str),
            ("instance_ref", Optional[InstanceRef]),
        ],
    )
):
    def __new__(
        cls,
        repository_origin: ExternalRepositoryOrigin,
        partition_set_name: str,
        partition_name: str,
        instance_ref: Optional[InstanceRef] = None,
    ):
        return super(PartitionArgs, cls).__new__(
            cls,
            repository_origin=check.inst_param(
                repository_origin,
                "repository_origin",
                ExternalRepositoryOrigin,
            ),
            partition_set_name=check.str_param(partition_set_name, "partition_set_name"),
            partition_name=check.str_param(partition_name, "partition_name"),
            instance_ref=check.opt_inst_param(instance_ref, "instance_ref", InstanceRef),
        )


@whitelist_for_serdes
class PartitionNamesArgs(
    NamedTuple(
        "_PartitionNamesArgs",
        [("repository_origin", ExternalRepositoryOrigin), ("partition_set_name", str)],
    )
):
    def __new__(cls, repository_origin: ExternalRepositoryOrigin, partition_set_name: str):
        return super(PartitionNamesArgs, cls).__new__(
            cls,
            repository_origin=check.inst_param(
                repository_origin, "repository_origin", ExternalRepositoryOrigin
            ),
            partition_set_name=check.str_param(partition_set_name, "partition_set_name"),
        )


@whitelist_for_serdes
class PartitionSetExecutionParamArgs(
    NamedTuple(
        "_PartitionSetExecutionParamArgs",
        [
            ("repository_origin", ExternalRepositoryOrigin),
            ("partition_set_name", str),
            ("partition_names", Sequence[str]),
            ("instance_ref", Optional[InstanceRef]),
        ],
    )
):
    def __new__(
        cls,
        repository_origin: ExternalRepositoryOrigin,
        partition_set_name: str,
        partition_names: Sequence[str],
        instance_ref: Optional[InstanceRef] = None,
    ):
        return super(PartitionSetExecutionParamArgs, cls).__new__(
            cls,
            repository_origin=check.inst_param(
                repository_origin, "repository_origin", ExternalRepositoryOrigin
            ),
            partition_set_name=check.str_param(partition_set_name, "partition_set_name"),
            partition_names=check.sequence_param(partition_names, "partition_names", of_type=str),
            instance_ref=check.opt_inst_param(instance_ref, "instance_ref", InstanceRef),
        )


@whitelist_for_serdes
class PipelineSubsetSnapshotArgs(
    NamedTuple(
        "_PipelineSubsetSnapshotArgs",
        [
            ("pipeline_origin", ExternalJobOrigin),
            ("solid_selection", Optional[Sequence[str]]),
            ("asset_selection", Optional[Sequence[AssetKey]]),
        ],
    )
):
    def __new__(
        cls,
        pipeline_origin: ExternalJobOrigin,
        solid_selection: Sequence[str],
        asset_selection: Optional[Sequence[AssetKey]] = None,
    ):
        return super(PipelineSubsetSnapshotArgs, cls).__new__(
            cls,
            pipeline_origin=check.inst_param(pipeline_origin, "pipeline_origin", ExternalJobOrigin),
            solid_selection=check.sequence_param(solid_selection, "solid_selection", of_type=str)
            if solid_selection
            else None,
            asset_selection=check.opt_sequence_param(
                asset_selection, "asset_selection", of_type=AssetKey
            ),
        )


# Different storage field name for backcompat
@whitelist_for_serdes(storage_field_names={"code_location_origin": "repository_location_origin"})
class NotebookPathArgs(
    NamedTuple(
        "_NotebookPathArgs",
        [("code_location_origin", CodeLocationOrigin), ("notebook_path", str)],
    )
):
    def __new__(cls, code_location_origin: CodeLocationOrigin, notebook_path: str):
        return super(NotebookPathArgs, cls).__new__(
            cls,
            code_location_origin=check.inst_param(
                code_location_origin, "code_location_origin", CodeLocationOrigin
            ),
            notebook_path=check.str_param(notebook_path, "notebook_path"),
        )


@whitelist_for_serdes
class ExternalScheduleExecutionArgs(
    NamedTuple(
        "_ExternalScheduleExecutionArgs",
        [
            ("repository_origin", ExternalRepositoryOrigin),
            ("instance_ref", Optional[InstanceRef]),
            ("schedule_name", str),
            ("scheduled_execution_timestamp", Optional[float]),
            ("scheduled_execution_timezone", Optional[str]),
        ],
    )
):
    def __new__(
        cls,
        repository_origin: ExternalRepositoryOrigin,
        instance_ref: Optional[InstanceRef],
        schedule_name: str,
        scheduled_execution_timestamp: Optional[float] = None,
        scheduled_execution_timezone: Optional[str] = None,
    ):
        return super(ExternalScheduleExecutionArgs, cls).__new__(
            cls,
            repository_origin=check.inst_param(
                repository_origin, "repository_origin", ExternalRepositoryOrigin
            ),
            instance_ref=check.opt_inst_param(instance_ref, "instance_ref", InstanceRef),
            schedule_name=check.str_param(schedule_name, "schedule_name"),
            scheduled_execution_timestamp=check.opt_float_param(
                scheduled_execution_timestamp, "scheduled_execution_timestamp"
            ),
            scheduled_execution_timezone=check.opt_str_param(
                scheduled_execution_timezone,
                "scheduled_execution_timezone",
            ),
        )


@whitelist_for_serdes
class SensorExecutionArgs(
    NamedTuple(
        "_SensorExecutionArgs",
        [
            ("repository_origin", ExternalRepositoryOrigin),
            ("instance_ref", Optional[InstanceRef]),
            ("sensor_name", str),
            ("last_completion_time", Optional[float]),
            ("last_run_key", Optional[str]),
            ("cursor", Optional[str]),
        ],
    )
):
    def __new__(
        cls,
        repository_origin: ExternalRepositoryOrigin,
        instance_ref: Optional[InstanceRef],
        sensor_name: str,
        last_completion_time: Optional[float],
        last_run_key: Optional[str],
        cursor: Optional[str],
    ):
        return super(SensorExecutionArgs, cls).__new__(
            cls,
            repository_origin=check.inst_param(
                repository_origin, "repository_origin", ExternalRepositoryOrigin
            ),
            instance_ref=check.opt_inst_param(instance_ref, "instance_ref", InstanceRef),
            sensor_name=check.str_param(sensor_name, "sensor_name"),
            last_completion_time=check.opt_float_param(
                last_completion_time, "last_completion_time"
            ),
            last_run_key=check.opt_str_param(last_run_key, "last_run_key"),
            cursor=check.opt_str_param(cursor, "cursor"),
        )


@whitelist_for_serdes
class ExternalJobArgs(
    NamedTuple(
        "_ExternalJobArgs",
        [
            ("repository_origin", ExternalRepositoryOrigin),
            ("instance_ref", InstanceRef),
            ("name", str),
        ],
    )
):
    def __new__(
        cls, repository_origin: ExternalRepositoryOrigin, instance_ref: InstanceRef, name: str
    ):
        return super(ExternalJobArgs, cls).__new__(
            cls,
            repository_origin=check.inst_param(
                repository_origin, "repository_origin", ExternalRepositoryOrigin
            ),
            instance_ref=check.inst_param(instance_ref, "instance_ref", InstanceRef),
            name=check.str_param(name, "name"),
        )


@whitelist_for_serdes
class ShutdownServerResult(
    NamedTuple(
        "_ShutdownServerResult",
        [("success", bool), ("serializable_error_info", Optional[SerializableErrorInfo])],
    )
):
    def __new__(cls, success: bool, serializable_error_info: Optional[SerializableErrorInfo]):
        return super(ShutdownServerResult, cls).__new__(
            cls,
            success=check.bool_param(success, "success"),
            serializable_error_info=check.opt_inst_param(
                serializable_error_info, "serializable_error_info", SerializableErrorInfo
            ),
        )


@whitelist_for_serdes
class CancelExecutionRequest(NamedTuple("_CancelExecutionRequest", [("run_id", str)])):
    def __new__(cls, run_id: str):
        return super(CancelExecutionRequest, cls).__new__(
            cls,
            run_id=check.str_param(run_id, "run_id"),
        )


@whitelist_for_serdes
class CancelExecutionResult(
    NamedTuple(
        "_CancelExecutionResult",
        [
            ("success", bool),
            ("message", Optional[str]),
            ("serializable_error_info", Optional[SerializableErrorInfo]),
        ],
    )
):
    def __new__(
        cls,
        success: bool,
        message: Optional[str],
        serializable_error_info: Optional[SerializableErrorInfo],
    ):
        return super(CancelExecutionResult, cls).__new__(
            cls,
            success=check.bool_param(success, "success"),
            message=check.opt_str_param(message, "message"),
            serializable_error_info=check.opt_inst_param(
                serializable_error_info, "serializable_error_info", SerializableErrorInfo
            ),
        )


@whitelist_for_serdes
class CanCancelExecutionRequest(NamedTuple("_CanCancelExecutionRequest", [("run_id", str)])):
    def __new__(cls, run_id: str):
        return super(CanCancelExecutionRequest, cls).__new__(
            cls,
            run_id=check.str_param(run_id, "run_id"),
        )


@whitelist_for_serdes
class CanCancelExecutionResult(NamedTuple("_CancelExecutionResult", [("can_cancel", bool)])):
    def __new__(cls, can_cancel: bool):
        return super(CanCancelExecutionResult, cls).__new__(
            cls,
            can_cancel=check.bool_param(can_cancel, "can_cancel"),
        )


@whitelist_for_serdes
class StartRunResult(
    NamedTuple(
        "_StartRunResult",
        [
            ("success", bool),
            ("message", Optional[str]),
            ("serializable_error_info", Optional[SerializableErrorInfo]),
        ],
    )
):
    def __new__(
        cls,
        success: bool,
        message: Optional[str],
        serializable_error_info: Optional[SerializableErrorInfo],
    ):
        return super(StartRunResult, cls).__new__(
            cls,
            success=check.bool_param(success, "success"),
            message=check.opt_str_param(message, "message"),
            serializable_error_info=check.opt_inst_param(
                serializable_error_info, "serializable_error_info", SerializableErrorInfo
            ),
        )


@whitelist_for_serdes
class GetCurrentImageResult(
    NamedTuple(
        "_GetCurrentImageResult",
        [
            ("current_image", Optional[str]),
            ("serializable_error_info", Optional[SerializableErrorInfo]),
        ],
    )
):
    def __new__(
        cls, current_image: Optional[str], serializable_error_info: Optional[SerializableErrorInfo]
    ):
        return super(GetCurrentImageResult, cls).__new__(
            cls,
            current_image=check.opt_str_param(current_image, "current_image"),
            serializable_error_info=check.opt_inst_param(
                serializable_error_info, "serializable_error_info", SerializableErrorInfo
            ),
        )


@whitelist_for_serdes
class GetCurrentRunsResult(
    NamedTuple(
        "_GetCurrentRunsResult",
        [
            ("current_runs", Sequence[str]),
            ("serializable_error_info", Optional[SerializableErrorInfo]),
        ],
    )
):
    def __new__(
        cls,
        current_runs: Sequence[str],
        serializable_error_info: Optional[SerializableErrorInfo],
    ):
        return super(GetCurrentRunsResult, cls).__new__(
            cls,
            current_runs=check.list_param(current_runs, "current_runs", of_type=str),
            serializable_error_info=check.opt_inst_param(
                serializable_error_info, "serializable_error_info", SerializableErrorInfo
            ),
        )
